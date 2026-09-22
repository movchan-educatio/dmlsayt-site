(function (global) {
  'use strict';

  var R = global.SiteRender;

  function esc(s) { return R.esc(String(s == null ? '' : s)); }
  function uid() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function safeUrl(url) {
    url = String(url || '').trim();
    return /^(https?:|mailto:|tel:|#|\/|\.\.?\/|uploads\/)/i.test(url) && !/^javascript:/i.test(url) ? url : '';
  }

  function classify(raw) {
    var t = raw.trim();
    if (!t) return 'text';
    if (/^#{2,6}\s/.test(t)) return 'heading';
    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(t) || /^<img\b[\s\S]*>$/i.test(t) || /^<figure\b[^>]*class=["'][^"']*media-image/i.test(t)) return 'image';
    if (/^<div\b[^>]*class=["'][^"']*google-document-viewer/i.test(t)) return 'document';
    if (/^<(iframe|div|section|figure|table)\b/i.test(t)) return /<iframe\b/i.test(t) ? 'embed' : 'legacy';
    if (/^([-*+]\s|\d+\.\s)/m.test(t)) return 'list';
    if (/^\|.+\|\s*\n\|(?:\s*:?-+:?\s*\|)+/m.test(t)) return 'table';
    if (/^---+$/.test(t)) return 'divider';
    if (/\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv|zip)(?:[?#)]|$)/i.test(t)) return 'document';
    if (/\]\(https?:\/\/(?:drive|docs)\.google\.com\//i.test(t)) return 'document';
    return 'text';
  }

  function parse(md) {
    var src = String(md || '').replace(/\r\n?/g, '\n');
    var chunks = [], current = [], depth = 0;
    src.split('\n').forEach(function (line) {
      var opens = (line.match(/<(div|section|figure|table)\b/gi) || []).length;
      var closes = (line.match(/<\/(div|section|figure|table)>/gi) || []).length;
      if (line === '' && depth === 0) {
        if (current.length) { chunks.push(current.join('\n')); current = []; }
        return;
      }
      current.push(line); depth = Math.max(0, depth + opens - closes);
    });
    if (current.length) chunks.push(current.join('\n'));
    chunks = chunks.filter(function (x) { return x.trim(); });
    return chunks.map(function (raw) { return { id: uid(), type: classify(raw), raw: raw.trim() }; });
  }

  function serialize(blocks) {
    return blocks.map(function (b) { return String(b.raw || '').trim(); }).filter(Boolean).join('\n\n') + (blocks.length ? '\n' : '');
  }

  function inlineMd(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var inner = Array.prototype.map.call(node.childNodes, inlineMd).join('');
    if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return '*' + inner + '*';
    if (tag === 'a') { var href = safeUrl(node.getAttribute('href')); return href ? '[' + inner + '](' + href + ')' : inner; }
    if (tag === 'br') return '\n';
    return inner;
  }

  function editableToMd(el, type, oldRaw) {
    if (type === 'heading') {
      var level = ((oldRaw.match(/^(#{2,6})\s/) || [,'##'])[1]).length;
      return new Array(level + 1).join('#') + ' ' + inlineMd(el).trim();
    }
    if (type === 'list') {
      var ordered = !!el.querySelector('ol');
      var items = el.querySelectorAll('li');
      if (items.length) return Array.prototype.map.call(items, function (li, i) { return (ordered ? (i + 1) + '. ' : '- ') + inlineMd(li).trim(); }).join('\n');
    }
    return Array.prototype.map.call(el.childNodes, function (n) {
      if (n.nodeType === 1 && /^(p|div)$/i.test(n.tagName)) return inlineMd(n).trim() + '\n\n';
      return inlineMd(n);
    }).join('').trim();
  }

  function imageData(raw) {
    var m = raw.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/);
    if (m) return { alt: m[1], src: m[2], caption: m[3] || '', width: '100', align: 'center', fit: 'contain' };
    if (/^<figure\b/i.test(raw)) {
      return {
        src: ((raw.match(/<img[^>]+src=["']([^"']+)/i) || [,''])[1]),
        alt: ((raw.match(/<img[^>]+alt=["']([^"']*)/i) || [,''])[1]),
        caption: ((raw.match(/<figcaption>([\s\S]*?)<\/figcaption>/i) || [,''])[1]).replace(/<[^>]+>/g, ''),
        width: ((raw.match(/data-width=["'](\d{1,3})["']/i) || [,'100'])[1]),
        align: ((raw.match(/data-align=["'](left|center|right)["']/i) || [,'center'])[1]),
        fit: ((raw.match(/data-fit=["'](contain|cover)["']/i) || [,'contain'])[1])
      };
    }
    m = raw.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return m ? { src: m[1], alt: ((raw.match(/alt=["']([^"']*)/i) || [,''])[1]), caption: '', width: '100', align: 'center', fit: 'contain' } : null;
  }

  function imageRaw(d) {
    var width = Math.max(20, Math.min(100, parseInt(d.width, 10) || 100));
    var align = /^(left|center|right)$/.test(d.align) ? d.align : 'center';
    var fit = d.fit === 'cover' ? 'cover' : 'contain';
    return '<figure class="media-image" data-width="' + width + '" data-align="' + align + '" data-fit="' + fit + '">' +
      '<img src="' + esc(d.src) + '" alt="' + esc(d.alt || '') + '">' +
      (d.caption ? '<figcaption>' + esc(d.caption) + '</figcaption>' : '') + '</figure>';
  }

  function smartUrlData(input) {
    var url = safeUrl(input);
    if (!url || !/^https?:/i.test(url)) return null;
    var yt = R.youtubeId(url);
    if (yt) return { type:'video', url:url, preview:'https://www.youtube-nocookie.com/embed/'+yt, title:'Відео YouTube' };
    var google = R.normalizeGoogleDriveUrl(url);
    if (google) return {type:'google',url:url,preview:google.previewUrl,title:google.title,google:google};
    return {type:'link',url:url,title:'Посилання'};
  }

  function smartRaw(data, title) {
    title = String(title || data.title || '').replace(/[\]\n]/g, ' ').trim() || data.title;
    if (data.type === 'video' && data.preview) return '<iframe src="'+esc(data.preview)+'" title="'+esc(title)+'" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    if (data.type === 'link') return '<a class="smart-link-card" href="'+esc(data.url)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+' ↗</a>';
    if (data.type === 'google' && data.google) return R.googleViewerRaw(data.google, title);
    return '['+title+']('+data.url+')';
  }

  function Editor(host, opts) {
    this.host = host; this.o = opts; this.blocks = parse(opts.body.text); this.undo = []; this.redo = [];
    this.dragId = null; this.saved = serialize(this.blocks); this.draftKey = 'dm_visual_draft_' + opts.slug;
    try { this.pendingDraft = localStorage.getItem(this.draftKey); } catch (e) { this.pendingDraft = null; }
    this.view = 'desktop'; this.render(); this.offerDraft();
  }

  Editor.prototype.isMobile = function () { return !!(window.matchMedia && window.matchMedia('(max-width:760px)').matches); };
  Editor.prototype.closeMobileActions = function (except) {
    if (!this.list) return;
    Array.prototype.forEach.call(this.list.querySelectorAll('.ve-mobile-actions.is-open'),function(menu){if(menu!==except){menu.classList.remove('is-open');menu.hidden=true;}});
  };
  Editor.prototype.keepActiveTextVisible = function () {
    if (!this.isMobile() || !this.activeBody) return;
    var vv=window.visualViewport, visibleTop=vv?vv.offsetTop:0, visibleHeight=vv?vv.height:window.innerHeight;
    var r=this.activeBody.getBoundingClientRect(), toolbarH=this.toolbar&&!this.toolbar.hidden?this.toolbar.offsetHeight+12:0;
    var visibleBottom=visibleTop+visibleHeight-toolbarH-12;
    if(r.bottom>visibleBottom||r.top<visibleTop+8)this.activeBody.scrollIntoView({block:r.bottom>visibleBottom?'center':'nearest',behavior:'smooth'});
  };
  Editor.prototype.bindMobileViewport = function () {
    if(this._viewportBound)return;this._viewportBound=true;var self=this;
    this._viewportResizeHandler=function(){if(!self.activeBody)return;self.showFormat(self.activeBody);window.clearTimeout(self._viewportSettleTimer);self._viewportSettleTimer=window.setTimeout(function(){self.keepActiveTextVisible();},80);};
    this._viewportScrollHandler=function(){if(self.activeBody)self.showFormat(self.activeBody);};
    if(window.visualViewport){window.visualViewport.addEventListener('resize',this._viewportResizeHandler);window.visualViewport.addEventListener('scroll',this._viewportScrollHandler);}
    window.addEventListener('orientationchange',this._viewportResizeHandler);
  };

  Editor.prototype.snapshot = function () { return JSON.stringify(this.blocks.map(function (b) { return { id:b.id,type:b.type,raw:b.raw }; })); };
  Editor.prototype.remember = function () { this.undo.push(this.snapshot()); if (this.undo.length > 80) this.undo.shift(); this.redo = []; if(this.undoBtn){this.undoBtn.disabled=false;this.redoBtn.disabled=true;} };
  Editor.prototype.restore = function (s) { this.blocks = JSON.parse(s); this.sync(); this.renderBlocks(); };
  Editor.prototype.sync = function () {
    var text = serialize(this.blocks); this.o.body.text = text; this.o.onChange(text);
    try { localStorage.setItem(this.draftKey, JSON.stringify({ text:text, at:Date.now() })); } catch (e) {}
    this.setStatus(text === this.saved ? '✓ Збережено' : '● Є незбережені зміни');
  };
  Editor.prototype.setStatus = function (s) { if (this.status) this.status.textContent = s; };
  Editor.prototype.offerDraft = function () {
    var self=this, d=null; try { d=JSON.parse(this.pendingDraft||'null'); } catch(e){} this.pendingDraft=null;
    if (!d || !d.text || d.text === this.o.body.text) return;
    this.o.confirmBox({title:'Відновити чернетку?',text:'Знайдено локальну чернетку цієї сторінки. Відновити її?',okLabel:'Відновити'}).then(function(ok){
      if(ok){ self.blocks=parse(d.text); self.sync(); self.renderBlocks(); }
    });
  };

  Editor.prototype.render = function () {
    var self=this; this.host.innerHTML=''; this.host.className='visual-editor';
    var bar=document.createElement('div'); bar.className='ve-topbar';
    bar.innerHTML='<div class="ve-page-id"><strong>Редагується: '+esc((this.o.node&&this.o.node.title)||'Сторінка')+'</strong><small>?page='+esc(this.o.slug)+'</small></div><div class="ve-history"></div><div class="ve-devices" role="group" aria-label="Розмір перегляду"></div><div class="ve-actions"></div>';
    function button(parent,label,title,fn,cls){var b=document.createElement('button');b.type='button';b.className='btn small '+(cls||'');b.textContent=label;b.title=title;b.addEventListener('click',fn);parent.appendChild(b);return b;}
    var hist=bar.querySelector('.ve-history');
    this.undoBtn=button(hist,'↶','Скасувати останню зміну',function(){if(!self.undo.length)return;self.redo.push(self.snapshot());self.restore(self.undo.pop());});
    this.redoBtn=button(hist,'↷','Повторити скасовану зміну',function(){if(!self.redo.length)return;self.undo.push(self.snapshot());self.restore(self.redo.pop());});
    this.status=document.createElement('span');this.status.className='ve-status';hist.appendChild(this.status);
    ['desktop','tablet','mobile'].forEach(function(v){button(bar.querySelector('.ve-devices'),v==='desktop'?'Desktop':v==='tablet'?'Tablet':'Mobile','Перевірити вигляд: '+v,function(){self.view=v;self.canvas.dataset.view=v;});});
    button(bar.querySelector('.ve-actions'),'⛶','Режим редактора / На весь екран',function(){self.toggleFocus();},'ve-focus-btn');
    button(bar.querySelector('.ve-actions'),'Перегляд','Відкрити чистий перегляд',function(){self.preview();},'ghost');
    button(bar.querySelector('.ve-actions'),'💾 Зберегти','Зберегти локальну чернетку',function(){self.saved=serialize(self.blocks);try{localStorage.setItem(self.draftKey,JSON.stringify({text:self.saved,at:Date.now()}));}catch(e){}self.setStatus('✓ Збережено');self.o.toast('Чернетку збережено в цьому браузері');},'primary');
    button(bar.querySelector('.ve-actions'),'?','Як користуватися редактором',function(){self.help();},'ghost ve-help-btn');
    this.toolbar=document.createElement('div');this.toolbar.className='ve-format';this.toolbar.hidden=true;
    this.toolbar.addEventListener('pointerdown',function(e){e.preventDefault();self.captureRange();});
    [['Ж','bold'],['К','italic'],['H2','formatBlock','H2'],['H3','formatBlock','H3'],['•','insertUnorderedList'],['1.','insertOrderedList']].forEach(function(x){button(self.toolbar,x[0],x[0],function(){self.formatCommand(x[1],x[2]||null);});});
    button(this.toolbar,'Очистити','Прибрати форматування',function(){self.clearFormatting();});
    button(this.toolbar,'Посилання','Додати посилання',function(){self.captureRange();var u=prompt('Введіть безпечну адресу посилання');u=safeUrl(u);if(u)self.formatCommand('createLink',u);else self.restoreRange();});
    this.canvas=document.createElement('div');this.canvas.className='ve-canvas';this.canvas.dataset.view='desktop';
    this.list=document.createElement('div');this.list.className='ve-blocks';this.canvas.appendChild(this.list);
    var add=document.createElement('button');add.type='button';add.className='ve-add';add.innerHTML='<span></span><b>+</b><span></span><em>Додати блок</em>';add.addEventListener('click',function(){self.addMenu();});this.canvas.appendChild(add);
    this.host.appendChild(bar);this.host.appendChild(this.toolbar);this.host.appendChild(this.canvas);this.renderBlocks();this.bindMobileViewport();this.sync();
    try{if(!localStorage.getItem('dm_visual_tour_done'))setTimeout(function(){self.tour(0);},300);}catch(e){}
  };

  Editor.prototype.renderBlocks = function () {
    var self=this;this.list.innerHTML='';
    this.blocks.forEach(function(block,index){
      var wrap=document.createElement('section');wrap.className='ve-block ve-'+block.type;wrap.dataset.id=block.id;wrap.draggable=true;wrap.tabIndex=0;
      var tools=document.createElement('div');tools.className='ve-block-tools';
      function act(label,title,fn,cls){var b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.className=cls||'';b.addEventListener('click',function(e){e.stopPropagation();fn();});tools.appendChild(b);}
      act('⋮⋮','Перетягніть, щоб змінити порядок',function(){} ,'ve-handle');
      act('↑','Перемістити вище',function(){self.move(index,-1);});act('↓','Перемістити нижче',function(){self.move(index,1);});
      act('✎','Налаштувати блок',function(){self.configure(index);});act('⧉','Створити копію блока',function(){self.remember();var c=clone(block);c.id=uid();self.blocks.splice(index+1,0,c);self.sync();self.renderBlocks();});
      act('🗑','Видалити блок',function(){self.remove(index);},'danger');wrap.appendChild(tools);
      var mobileToggle=document.createElement('button');mobileToggle.type='button';mobileToggle.className='ve-mobile-actions-toggle';mobileToggle.textContent='•••';mobileToggle.setAttribute('aria-label','Дії з блоком');mobileToggle.setAttribute('aria-expanded','false');
      var mobileMenu=document.createElement('div');mobileMenu.className='ve-mobile-actions';mobileMenu.hidden=true;mobileMenu.setAttribute('role','menu');
      [['Перемістити вгору',function(){self.move(index,-1);}],['Перемістити вниз',function(){self.move(index,1);}],['Налаштування',function(){self.configure(index);}],['Дублювати',function(){self.remember();var c=clone(block);c.id=uid();self.blocks.splice(index+1,0,c);self.sync();self.renderBlocks();}],['Видалити',function(){self.remove(index);},'danger']].forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=item[0];b.className=item[2]||'';b.setAttribute('role','menuitem');b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();mobileMenu.hidden=true;mobileMenu.classList.remove('is-open');mobileToggle.setAttribute('aria-expanded','false');item[1]();});mobileMenu.appendChild(b);});
      mobileToggle.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});mobileToggle.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var open=mobileMenu.hidden;self.closeMobileActions(mobileMenu);mobileMenu.hidden=!open;mobileMenu.classList.toggle('is-open',open);mobileToggle.setAttribute('aria-expanded',String(open));});wrap.appendChild(mobileToggle);wrap.appendChild(mobileMenu);
      var body=document.createElement('div');body.className='ve-block-body prose';
      if(/^(text|heading|list)$/.test(block.type)){
        body.contentEditable='true';body.spellcheck=true;body.innerHTML=R.mdToHtml(block.raw);body.addEventListener('focus',function(){self.activeBody=body;wrap.classList.add('is-editing');self.closeMobileActions();self.selectBlock(wrap);self.showFormat(body);setTimeout(function(){self.keepActiveTextVisible();},80);});
        body.addEventListener('mouseup',function(){self.captureRange();self.showFormat(body);});
        body.addEventListener('keyup',function(){self.captureRange();self.showFormat(body);});
        body.addEventListener('input',function(){if(!body.dataset.started){self.remember();body.dataset.started='1';}block.raw=editableToMd(body,block.type,block.raw);self.sync();});
        body.addEventListener('blur',function(){body.dataset.started='';setTimeout(function(){if(document.activeElement!==body){wrap.classList.remove('is-editing');if(self.activeBody===body&&!self.toolbar.matches(':hover'))self.toolbar.hidden=true;}},180);});
      } else { body.innerHTML=R.mdToHtml(block.raw);R.enhance(body,{resolve:self.o.resolvePath}); if(block.type==='legacy')body.insertAdjacentHTML('afterbegin','<span class="ve-legacy-label">Legacy / HTML block</span>'); }
      wrap.appendChild(body);
      if(block.type==='image'){
        var imageInfo=imageData(block.raw);
        if(imageInfo){var figure=body.querySelector('.media-image')||body;figure.classList.add('ve-resizable-image');figure.style.width=(imageInfo.width||100)+'%';figure.dataset.align=imageInfo.align||'center';figure.dataset.fit=imageInfo.fit||'contain';['nw','ne','sw','se'].forEach(function(pos){var handle=document.createElement('button');handle.type='button';handle.className='ve-resize-handle ve-resize-'+pos;handle.setAttribute('aria-label','Змінити розмір фотографії');handle.addEventListener('pointerdown',function(e){self.startImageResize(e,block,body,figure);});figure.appendChild(handle);});}
        var photoTools=document.createElement('div');photoTools.className='ve-image-overlay';
        var replace=document.createElement('button');replace.type='button';replace.textContent='✎ Замінити';replace.onclick=function(e){e.stopPropagation();self.o.pickMedia({mode:'image'}).then(function(x){if(!x)return;var d=imageData(block.raw)||{alt:'',caption:'',width:'100',align:'center',fit:'contain'};d.src=x.path;d.alt=x.alt||d.alt||'';self.remember();block.raw=imageRaw(d);self.sync();self.renderBlocks();});};
        var settings=document.createElement('button');settings.type='button';settings.textContent='⚙ Налаштування';settings.onclick=function(e){e.stopPropagation();self.configure(index);};photoTools.appendChild(replace);photoTools.appendChild(settings);wrap.appendChild(photoTools);
      }
      wrap.addEventListener('click',function(){self.selectBlock(wrap);});
      wrap.addEventListener('dragstart',function(e){self.dragId=block.id;wrap.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
      wrap.addEventListener('dragend',function(){wrap.classList.remove('dragging');self.dragId=null;});
      wrap.addEventListener('dragover',function(e){e.preventDefault();wrap.classList.add('drop-before');});
      wrap.addEventListener('dragleave',function(){wrap.classList.remove('drop-before');});
      wrap.addEventListener('drop',function(e){e.preventDefault();wrap.classList.remove('drop-before');var from=self.blocks.findIndex(function(b){return b.id===self.dragId;});if(from<0||from===index)return;self.remember();var moved=self.blocks.splice(from,1)[0];var to=self.blocks.findIndex(function(b){return b.id===block.id;});self.blocks.splice(to,0,moved);self.sync();self.renderBlocks();});
      self.list.appendChild(wrap);
    });
    if(!this.blocks.length)this.list.innerHTML='<p class="ve-empty">Сторінка порожня. Натисніть «+ Додати блок».</p>';
    if(this.undoBtn){this.undoBtn.disabled=!this.undo.length;this.redoBtn.disabled=!this.redo.length;}
    if(!this._outsideHandler){
      this._outsideHandler=function(e){
        if(!self.host.isConnected){document.removeEventListener('pointerdown',self._outsideHandler,true);return;}
        if(e.target.closest('.ve-block,.ve-format,.modal,.overlay'))return;
        self.clearSelection();
      };
      document.addEventListener('pointerdown',this._outsideHandler,true);
    }
  };

  Editor.prototype.selectBlock=function(wrap){Array.prototype.forEach.call(this.list.querySelectorAll('.ve-block.is-selected'),function(x){if(x!==wrap)x.classList.remove('is-selected');});this.closeMobileActions();wrap.classList.add('is-selected');};
  Editor.prototype.clearSelection=function(){Array.prototype.forEach.call(this.list.querySelectorAll('.ve-block.is-selected,.ve-block.is-editing'),function(x){x.classList.remove('is-selected','is-editing');});this.closeMobileActions();this.toolbar.hidden=true;this.activeBody=null;this.savedRange=null;};
  Editor.prototype.captureRange=function(){var s=window.getSelection&&window.getSelection();if(!s||!s.rangeCount||!this.activeBody)return;var r=s.getRangeAt(0);if(this.activeBody.contains(r.commonAncestorContainer))this.savedRange=r.cloneRange();};
  Editor.prototype.restoreRange=function(){if(!this.savedRange||!this.activeBody)return false;this.activeBody.focus();var s=window.getSelection();s.removeAllRanges();s.addRange(this.savedRange);return true;};
  Editor.prototype.commitActive=function(){if(!this.activeBody)return;this.activeBody.dispatchEvent(new Event('input',{bubbles:true}));this.captureRange();this.showFormat(this.activeBody);};
  Editor.prototype.formatCommand=function(cmd,value){if(!this.restoreRange())return;document.execCommand(cmd,false,value);this.commitActive();};
  Editor.prototype.clearFormatting=function(){if(!this.restoreRange())return;var range=this.savedRange,marks=[],n=range&&range.commonAncestorContainer,el=n&&n.nodeType===1?n:n&&n.parentElement;if(el&&el.closest){var nearest=el.closest('strong,b,em,i,a,u,s,code,span');if(nearest&&this.activeBody.contains(nearest))marks.push(nearest);}if(range&&this.activeBody){Array.prototype.forEach.call(this.activeBody.querySelectorAll('strong,b,em,i,a,u,s,code,span'),function(mark){try{if(range.intersectsNode(mark)&&marks.indexOf(mark)<0)marks.push(mark);}catch(e){}});}document.execCommand('removeFormat',false,null);document.execCommand('unlink',false,null);marks.forEach(function(mark){if(!mark.parentNode)return;while(mark.firstChild)mark.parentNode.insertBefore(mark.firstChild,mark);mark.parentNode.removeChild(mark);});if(el&&el.closest&&el.closest('li')){var list=el.closest('ol,ul');document.execCommand(list&&list.tagName==='OL'?'insertOrderedList':'insertUnorderedList',false,null);}else if(el&&el.closest&&el.closest('h2,h3,h4,h5,h6'))document.execCommand('formatBlock',false,'P');this.commitActive();};
  Editor.prototype.showFormat=function(body){var r=body.getBoundingClientRect(),gap=8,vv=window.visualViewport,vw=vv?vv.width:window.innerWidth,vh=vv?vv.height:window.innerHeight,ox=vv?vv.offsetLeft:0,oy=vv?vv.offsetTop:0;this.toolbar.hidden=false;var tw=this.toolbar.offsetWidth,th=this.toolbar.offsetHeight;if(this.isMobile()){this.toolbar.style.left=Math.round(ox+6)+'px';this.toolbar.style.width=Math.max(0,Math.round(vw-12))+'px';this.toolbar.style.top=Math.max(oy+6,Math.round(oy+vh-th-gap))+'px';return;}this.toolbar.style.width='';var top=r.top>=th+gap?Math.max(gap,r.top-th-gap):Math.min(vh-th-gap,r.bottom+gap);var left=Math.max(gap,Math.min(vw-tw-gap,r.left));this.toolbar.style.top=Math.round(top)+'px';this.toolbar.style.left=Math.round(left)+'px';};
  Editor.prototype.toggleFocus=function(){var on=document.body.classList.toggle('ve-focus');var b=this.host.querySelector('.ve-focus-btn');if(b){b.textContent=on?'×':'⛶';b.title=on?'Вийти з режиму редактора':'Режим редактора / На весь екран';}if(on){var self=this;var leave=function(e){if(e.key==='Escape'&&document.body.classList.contains('ve-focus')){self.toggleFocus();window.removeEventListener('keydown',leave);}};window.addEventListener('keydown',leave);}};

  Editor.prototype.move=function(i,d){var n=i+d;if(n<0||n>=this.blocks.length)return;this.remember();var b=this.blocks.splice(i,1)[0];this.blocks.splice(n,0,b);this.sync();this.renderBlocks();};
  Editor.prototype.remove=function(i){var self=this;this.o.confirmBox({title:'Видалити цей блок?',text:'Блок зникне зі сторінки. Дію можна скасувати кнопкою Undo.',okLabel:'Видалити',danger:true}).then(function(ok){if(!ok)return;self.remember();self.blocks.splice(i,1);self.sync();self.renderBlocks();});};
  Editor.prototype.startImageResize=function(e,block,body,figure){if(window.matchMedia('(max-width:760px)').matches)return;e.preventDefault();e.stopPropagation();var self=this,startX=e.clientX,startWidth=figure.getBoundingClientRect().width,limit=body.getBoundingClientRect().width,d=imageData(block.raw);if(!d)return;this.remember();function move(ev){var delta=(/w$/.test(e.target.className)?startX-ev.clientX:ev.clientX-startX);var pct=Math.max(20,Math.min(100,Math.round((startWidth+delta)/limit*100)));figure.style.width=pct+'%';d.width=String(pct);}function end(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);block.raw=imageRaw(d);self.sync();self.renderBlocks();}window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});};
  Editor.prototype.addSmartUrl=function(kind,modalRef){var self=this;var label=kind==='video'?'Посилання на відео':'Посилання';var u=prompt(label);var data=smartUrlData(u);if(!data)return self.o.toast('Не вдалося розпізнати безпечне посилання',true);if(kind==='video'&&data.type!=='video')data.title='Відеопосилання';self.remember();self.blocks.push({id:uid(),type:data.type==='video'?'embed':data.type==='google'?'document':'text',raw:smartRaw(data)});self.sync();self.renderBlocks();if(modalRef)modalRef.close();};
  Editor.prototype.addDocument=function(parentModal){var self=this;var box=document.createElement('div');box.className='ve-document-add';box.innerHTML='<button class="ve-document-drop" type="button"><strong>Перетягніть файл сюди</strong><span>або виберіть файл з комп’ютера</span></button><div class="ve-or"><span>або</span></div><label class="f"><span>Посилання на Google Drive</span><input id="ve-drive-url" type="url" placeholder="https://drive.google.com/..."><small>Просто вставте посилання, скопійоване з Google Drive — тип документа визначиться автоматично.</small></label>';var input=box.querySelector('#ve-drive-url');var m=this.o.modal({title:'Додати документ',build:function(m){m.body.appendChild(box);var add=document.createElement('button');add.type='button';add.className='btn primary';add.textContent='Додати документ';add.onclick=function(){var data=smartUrlData(input.value);if(!data||data.type!=='google')return self.o.toast('Вставте звичайне посилання Google Drive',true);self.remember();self.blocks.push({id:uid(),type:'document',raw:smartRaw(data)});self.sync();self.renderBlocks();m.close();if(parentModal)parentModal.close();};m.foot.appendChild(add);}});box.querySelector('.ve-document-drop').onclick=function(){self.o.pickMedia({mode:'file'}).then(function(x){if(!x)return;self.remember();self.blocks.push({id:uid(),type:'document',raw:'['+x.path.split('/').pop()+']('+x.path+')'});self.sync();self.renderBlocks();m.close();if(parentModal)parentModal.close();});};};
  Editor.prototype.addMenu=function(){var self=this;var choices=[['text','Текст','Новий текст'],['heading','Заголовок','## Новий заголовок'],['image','Фото',''],['list','Список','- Новий пункт'],['document','Документ',''],['video','Відео',''],['link','Посилання',''],['divider','Розділювач','---']];var box=document.createElement('div');box.className='ve-add-grid';choices.forEach(function(c){var b=document.createElement('button');b.type='button';b.textContent=c[1];b.addEventListener('click',function(){if(c[0]==='image')return self.o.pickMedia({mode:'image'}).then(function(x){if(x){self.remember();self.blocks.push({id:uid(),type:'image',raw:imageRaw({src:x.path,alt:x.alt||'',caption:'',width:'100',align:'center',fit:'contain'})});self.sync();self.renderBlocks();m.close();}});if(c[0]==='document')return self.addDocument(m);if(c[0]==='video'||c[0]==='link')return self.addSmartUrl(c[0],m);self.remember();self.blocks.push({id:uid(),type:c[0],raw:c[2]});self.sync();self.renderBlocks();m.close();});box.appendChild(b);});var m=this.o.modal({title:'Додати блок',build:function(m){m.body.appendChild(box);}});};
  Editor.prototype.configure=function(i){var self=this,b=this.blocks[i];if(b.type==='image'){var d=imageData(b.raw)||{src:'',alt:'',caption:'',width:'100',align:'center',fit:'contain'};var box=document.createElement('div');box.className='ve-image-settings';box.innerHTML='<label class="f"><span>Alt-текст</span><input id="ve-alt" type="text"></label><label class="f"><span>Підпис</span><input id="ve-cap" type="text"></label><label class="f"><span>Розмір</span><select id="ve-size"><option value="35">Маленьке</option><option value="55">Середнє</option><option value="75">Велике</option><option value="100">На всю ширину</option><option value="custom">Власний розмір</option></select></label><label class="f ve-custom-size"><span>Ширина: <b id="ve-width-out"></b></span><input id="ve-width" type="range" min="20" max="100" step="1"></label><label class="f"><span>Вирівнювання</span><select id="ve-align"><option value="left">Ліворуч</option><option value="center">По центру</option><option value="right">Праворуч</option></select></label><label class="f"><span>Відображення</span><select id="ve-fit"><option value="contain">Без кадрування</option><option value="cover">Пропорційно заповнити</option></select></label><button class="btn" type="button" id="ve-replace">Замінити фото</button>';var alt=box.querySelector('#ve-alt'),cap=box.querySelector('#ve-cap'),size=box.querySelector('#ve-size'),width=box.querySelector('#ve-width'),out=box.querySelector('#ve-width-out'),align=box.querySelector('#ve-align'),fit=box.querySelector('#ve-fit');alt.value=d.alt;cap.value=d.caption;width.value=d.width||100;out.textContent=width.value+'%';align.value=d.align||'center';fit.value=d.fit||'contain';size.value=['35','55','75','100'].indexOf(String(d.width))>=0?String(d.width):'custom';function syncSize(){if(size.value!=='custom')width.value=size.value;out.textContent=width.value+'%';box.querySelector('.ve-custom-size').hidden=size.value!=='custom';}size.onchange=syncSize;width.oninput=function(){out.textContent=width.value+'%';};syncSize();var m=this.o.modal({title:'Налаштування фотографії',build:function(m){m.body.appendChild(box);m.foot.appendChild(Object.assign(document.createElement('button'),{type:'button',className:'btn primary',textContent:'Застосувати'}));m.foot.lastChild.onclick=function(){self.remember();d.alt=alt.value;d.caption=cap.value;d.width=width.value;d.align=align.value;d.fit=fit.value;b.raw=imageRaw(d);self.sync();self.renderBlocks();m.close();};}});box.querySelector('#ve-replace').onclick=function(){self.o.pickMedia({mode:'image'}).then(function(x){if(x){d.src=x.path;if(x.alt)alt.value=x.alt;}});};return;}
    if(b.type==='legacy'){this.o.modal({title:'Сумісний блок',build:function(m){var p=document.createElement('p');p.textContent='Цей блок створено у старій версії сайту. Він збережений без змін для сумісності. Для нового матеріалу використовуйте звичайні типи блоків.';m.body.appendChild(p);}});return;}
    if(b.type==='document'||b.type==='embed'){var match=b.raw.match(/(?:href|src)=["']([^"']+)/i)||b.raw.match(/\]\(([^)]+)\)/);var current=match?match[1]:'';var smart=document.createElement('div');smart.className='ve-smart-settings';smart.innerHTML='<label class="f"><span>'+(b.type==='embed'?'Посилання на відео':'Посилання на документ')+'</span><input id="ve-smart-url" type="url" placeholder="https://..."></label><p class="hint">Вставте звичайне посилання — редактор сам визначить безпечний формат.</p>';var input=smart.querySelector('input');input.value=current;var sm=this.o.modal({title:b.type==='embed'?'Налаштування відео':'Налаштування документа',build:function(m){m.body.appendChild(smart);if(b.type==='document'){var pick=document.createElement('button');pick.type='button';pick.className='btn';pick.textContent='Вибрати файл з комп’ютера';pick.onclick=function(){self.o.pickMedia({mode:'file'}).then(function(x){if(x)input.value=x.path;});};m.body.appendChild(pick);}var apply=document.createElement('button');apply.type='button';apply.className='btn primary';apply.textContent='Застосувати';apply.onclick=function(){var value=input.value.trim();if(!value)return self.o.toast('Вкажіть посилання або виберіть файл',true);self.remember();if(!/^https?:/i.test(value)){if(!safeUrl(value))return self.o.toast('Небезпечну адресу заблоковано',true);b.raw='['+value.split('/').pop()+']('+value+')';b.type='document';}else{var data=smartUrlData(value);if(!data)return self.o.toast('Не вдалося розпізнати безпечне посилання',true);b.raw=smartRaw(data);b.type=data.type==='video'?'embed':data.type==='google'?'document':'text';}self.sync();self.renderBlocks();m.close();};m.foot.appendChild(apply);}});return;}
    var area=document.createElement('textarea');area.rows=12;area.value=b.raw;var m2=this.o.modal({title:b.type==='legacy'?'Legacy / HTML block':'Налаштування блока',wide:true,build:function(m){m.body.appendChild(area);m.foot.appendChild(Object.assign(document.createElement('button'),{type:'button',className:'btn primary',textContent:'Застосувати'}));m.foot.lastChild.onclick=function(){var value=area.value;if(/javascript\s*:/i.test(value))return self.o.toast('Небезпечну адресу заблоковано',true);self.remember();b.raw=value;b.type=classify(value);self.sync();self.renderBlocks();m.close();};}});};
  Editor.prototype.preview=function(){var self=this,html=R.mdToHtml(serialize(this.blocks));var frame=document.createElement('iframe');frame.className='ve-preview-frame';frame.title='Перегляд сторінки';var m=this.o.modal({title:'Перегляд сторінки',wide:true,build:function(m){m.body.appendChild(frame);}});frame.addEventListener('load',function(){var prose=frame.contentDocument&&frame.contentDocument.querySelector('.prose');if(prose)R.enhance(prose,{resolve:self.o.resolvePath});});frame.srcdoc='<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="../assets/css/site.css?v=20260922-2"></head><body><main style="padding:24px"><article class="paper layout-editorial"><div class="prose">'+html+'</div></article></main></body></html>';};
  Editor.prototype.help=function(){var self=this;var body=document.createElement('div');body.className='ve-help';body.innerHTML='<p>Редактор показує сторінку блоками. Усі дії виконуються без знання коду.</p><ol><li><b>Відкрити сторінку:</b> оберіть її у списку ліворуч.</li><li><b>Змінити текст:</b> натисніть абзац і друкуйте.</li><li><b>Змінити заголовок:</b> натисніть його; H2 і H3 задають рівень.</li><li><b>Жирний або курсив:</b> виділіть слова й натисніть Ж або К.</li><li><b>Додати посилання:</b> виділіть текст, натисніть «Посилання» та введіть адресу.</li><li><b>Перетягнути блок:</b> схопіть ⋮⋮ і перенесіть до потрібного місця.</li><li><b>Без миші або на телефоні:</b> використовуйте ↑ і ↓.</li><li><b>Додати блок:</b> натисніть «+ Додати блок» і виберіть тип.</li><li><b>Дублювати:</b> натисніть ⧉ — копія з’явиться під оригіналом.</li><li><b>Видалити:</b> натисніть 🗑 і підтвердьте дію.</li><li><b>Замінити фото:</b> натисніть ✎ біля фото, потім «Замінити фото».</li><li><b>Додати фото:</b> виберіть «Фото» в меню нового блока.</li><li><b>Alt і підпис:</b> відкрийте ✎ біля фото та заповніть поля.</li><li><b>Порядок фотографій:</b> перетягуйте блоки фото або використовуйте ↑/↓.</li><li><b>Картки:</b> змінюйте їхній зміст і порядок як звичайні блоки; сітку сайт побудує сам.</li><li><b>Документ:</b> додайте файл через відповідний тип блока або змініть його через ✎.</li><li><b>Змінити адресу:</b> відкрийте ✎ біля блока; небезпечні адреси блокуються.</li><li><b>Відео та вбудовані матеріали:</b> відкрийте ✎, змініть дозволену HTTPS-адресу або перемістіть блок.</li><li><b>Undo/Redo:</b> ↶ скасовує останню дію, ↷ повертає її.</li><li><b>Перевірка:</b> перемикайте Desktop, Tablet і Mobile.</li><li><b>Чистий перегляд:</b> натисніть 👁 «Перегляд».</li><li><b>Зберегти чи опублікувати:</b> «Зберегти» лишає чернетку в цьому браузері; «Опублікувати зміни» зверху відправляє її на сайт.</li><li><b>Якщо сталася помилка:</b> натисніть ↶ або не публікуйте зміни.</li><li><b>Вихід без втрат:</b> спочатку натисніть «Зберегти»; при неопублікованих змінах редактор також покаже попередження.</li></ol><button class="btn primary" type="button" id="ve-tour-again">Повторити навчання</button>';var m=this.o.modal({title:'Як користуватися редактором',wide:true,build:function(m){m.body.appendChild(body);}});body.querySelector('#ve-tour-again').onclick=function(){m.close();self.tour(0);};};
  Editor.prototype.tour=function(step){var self=this;var tips=['Натисніть на текст, щоб його змінити.','Схопіть ⋮⋮, щоб перемістити блок. На телефоні є ↑ і ↓.','Натисніть «+ Додати блок», щоб додати матеріал.','Натисніть ✎ біля фото, щоб його замінити.','Перевірте Desktop, Tablet і Mobile перед публікацією.','Коли все готово, збережіть чернетку, а потім натисніть «Опублікувати зміни» у верхній панелі.'];var box=document.createElement('div');box.className='ve-tour';box.innerHTML='<strong>'+(step+1)+'/'+tips.length+'</strong><p>'+tips[step]+'</p>';var m=this.o.modal({title:'Швидке навчання',build:function(m){m.body.appendChild(box);if(step>0){var prev=document.createElement('button');prev.className='btn';prev.textContent='Назад';prev.onclick=function(){m.close();self.tour(step-1);};m.foot.appendChild(prev);}var skip=document.createElement('button');skip.className='btn';skip.textContent='Пропустити';skip.onclick=function(){try{localStorage.setItem('dm_visual_tour_done','1');}catch(e){}m.close();};m.foot.appendChild(skip);var next=document.createElement('button');next.className='btn primary';next.textContent=step===tips.length-1?'Готово':'Далі';next.onclick=function(){m.close();if(step<tips.length-1)self.tour(step+1);else try{localStorage.setItem('dm_visual_tour_done','1');}catch(e){}};m.foot.appendChild(next);}});};

  global.VisualPageEditor={parse:parse,serialize:serialize,imageData:imageData,imageRaw:imageRaw,smartUrlData:smartUrlData,smartRaw:smartRaw,mount:function(host,opts){return new Editor(host,opts);}};
})(window);
