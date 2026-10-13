
/* Progressive enhancement, mobile only: compact month + accessible selected-day details.
   Does not modify Firebase listeners or the desktop calendar. */
(() => {
  'use strict';
  const mq = window.matchMedia('(max-width: 900px)');
  const calendar = document.getElementById('calendar');
  if (!calendar) return;
  let selectedDate = '';
  let rendering = false;
  let pending = false;
  let agenda = null;
  const dateLabel = (value) => {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return '';
    return `${String(parts[2]).padStart(2,'0')}/${String(parts[1]).padStart(2,'0')}/${parts[0]}`;
  };
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  function ensureAgenda() {
    if (agenda && agenda.isConnected) return agenda;
    const wrap = document.querySelector('.calendar-wrap');
    if (!wrap) return null;
    agenda = document.getElementById('amorri-mobile-day-agenda');
    if (!agenda) {
      agenda = document.createElement('section');
      agenda.id = 'amorri-mobile-day-agenda';
      agenda.setAttribute('aria-live', 'polite');
      agenda.setAttribute('aria-label', 'Lịch ngày được chọn');
      wrap.insertAdjacentElement('afterend', agenda);
    }
    return agenda;
  }
  function decorate() {
    pending = false;
    if (!mq.matches) { if (agenda) agenda.hidden = true; return; }
    const days = [...calendar.querySelectorAll('.month-grid>.day[data-date]')];
    if (!days.length) return;
    const region = ensureAgenda();
    if (!region) return;
    region.hidden = false;
    rendering = true;
    try {
      if (!days.some(el => el.dataset.date === selectedDate && !el.classList.contains('other'))) {
        const today = localToday();
        selectedDate = days.some(el => el.dataset.date === today && !el.classList.contains('other'))
          ? today : (days.find(el => !el.classList.contains('other') && el.querySelector('.event-chip')) || days.find(el => !el.classList.contains('other')) || days[0]).dataset.date;
      }
      days.forEach(day => {
        let dots = day.querySelector('.amorri-day-indicators');
        if (!dots) { dots = document.createElement('div'); dots.className = 'amorri-day-indicators'; day.append(dots); }
        const count = day.querySelectorAll(':scope > .event-chip').length;
        const more = [...day.children].find(n => n !== dots && n !== day.querySelector('.daynum') && /^\+\d+ lịch khác/.test(n.textContent.trim()));
        const extra = more ? Number((more.textContent.match(/\d+/) || [0])[0]) : 0;
        const total = count + extra;
        const blackout = day.querySelector(':scope > .blackout-chip');
        dots.replaceChildren();
        if (blackout) { const span = document.createElement('i'); span.className = 'am-dot is-blackout'; span.setAttribute('aria-hidden','true');dots.append(span); }
        for (let i=0; i<Math.min(total,3); i++) {const span=document.createElement('i');span.className='am-dot';span.setAttribute('aria-hidden','true'); dots.append(span);}
        if (total>3) {const moreNum=document.createElement('span');moreNum.className='am-more';moreNum.textContent=`+${total-3}`;dots.append(moreNum);}
        const active=day.dataset.date===selectedDate;
        day.classList.toggle('amorri-mobile-selected',active);
        day.setAttribute('role','button');day.tabIndex=0;
        day.setAttribute('aria-label',`Ngày ${dateLabel(day.dataset.date)}, ${total} lịch${blackout?', có báo bận':''}`);
        day.setAttribute('aria-pressed',String(active));
      });
      const day = days.find(d => d.dataset.date === selectedDate);
      region.replaceChildren();
      const head=document.createElement('div');head.className='am-day-top';
      const title=document.createElement('div');title.className='am-day-title';title.textContent=`Lịch ngày ${dateLabel(selectedDate)}`;
      const count=document.createElement('span');count.className='am-day-count';
      const events=day ? [...day.querySelectorAll(':scope > .event-chip')] : [];
      const extraLine=day && [...day.children].find(n => /^\+\d+ lịch khác/.test(n.textContent.trim()));
      const extra=extraLine ? Number((extraLine.textContent.match(/\d+/) || [0])[0]) : 0;
      const list=document.createElement('div');list.className='am-day-list';
      let allItems=null;
      try {
        if (typeof getFilteredEvents==='function' && typeof chip==='function') {
          allItems=getFilteredEvents().filter(e=>e.date===selectedDate).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
          list.innerHTML=allItems.map(chip).join('');
          list.querySelectorAll('.event-chip').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');});
        }
      } catch(e) {console.warn('Mobile agenda fallback:',e);allItems=null;list.replaceChildren();}
      if(!allItems)for (const event of events) {const clone=event.cloneNode(true);clone.tabIndex=0;clone.setAttribute('role','button');list.append(clone);}
      count.textContent=`${allItems?allItems.length:events.length+extra} lịch`;head.append(title,count);region.append(head);
      const blackout=day?.querySelector(':scope > .blackout-chip');
      if (blackout) {const info=document.createElement('div');info.className='am-empty';info.textContent=blackout.textContent.trim();list.append(info);}
      if (extra && !allItems) {const info=document.createElement('div');info.className='am-empty';info.textContent=`Còn ${extra} lịch khác trong ngày; sử dụng bộ lọc để xem chi tiết.`;list.append(info);}
      if (!list.childElementCount) {const empty=document.createElement('div');empty.className='am-empty';empty.textContent='Ngày này chưa có lịch trong bộ lọc hiện tại.';list.append(empty);}
      region.append(list);
    } finally {rendering=false;}
  }
  function schedule() { if (!pending) {pending=true;requestAnimationFrame(decorate);} }
  calendar.addEventListener('click', e => {
    if (!mq.matches || e.target.closest('.event-chip,.blackout-chip,button')) return;
    const day=e.target.closest('.month-grid>.day[data-date]');
    if (day) {selectedDate=day.dataset.date;decorate();}
  });
  calendar.addEventListener('keydown', e => {
    if (!mq.matches || !['Enter',' '].includes(e.key) || e.target !== e.target.closest('.month-grid>.day[data-date]')) return;
    e.preventDefault();selectedDate=e.target.dataset.date;decorate();
  });
  document.addEventListener('keydown', e => {
    const chip=e.target.closest?.('#amorri-mobile-day-agenda .event-chip');
    if (mq.matches && chip && (e.key === 'Enter' || e.key === ' ')) {e.preventDefault();chip.click();}
  });
  // Existing global delegated click handler still opens event edit details when permitted.
  const observer=new MutationObserver(records=>{
    if (!rendering && records.some(record=>[...record.addedNodes].some(n=>n.nodeType===1 && (n.classList?.contains('month-grid') || n.classList?.contains('weekdays'))))) schedule();
  });
  observer.observe(calendar,{childList:true});
  mq.addEventListener('change',schedule);
  schedule();
})();

//# sourceURL=assets/js/enhancement-05.js
