import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Upload, ImageIcon, ChevronLeft, ChevronRight, ChevronDown, X, Download, FolderPlus, Folder,
} from 'lucide-react';
import { api } from '../api';
import { PageHeader, Spinner, Empty, Field, Input, Select } from '../components/ui';
import Modal from '../components/Modal';
import { compressImage } from '../utils/image';
import { t } from '../i18n';

const ALL = 'all';
const CATS = 'cats';

export default function Catalog() {
  const [cats, setCats] = useState(null);
  const [images, setImages] = useState(null);
  const [tab, setTab] = useState(ALL);            // 'all' = every image, 'cats' = categories accordion
  const [expanded, setExpanded] = useState(() => new Set());
  const [catModal, setCatModal] = useState(null); // {} = new, {id,name} = rename
  const [pickCat, setPickCat] = useState(false);  // "all" tab upload: choose a category first
  const [upload, setUpload] = useState(null);     // {categoryId,done,total}
  const [err, setErr] = useState('');
  const [view, setView] = useState(null);         // {scope: 'all' | categoryId, index}
  const fileRef = useRef();
  const uploadTarget = useRef(null);

  const load = async () => {
    const [c, i] = await Promise.all([api.get('/api/catalog/categories'), api.get('/api/catalog/images')]);
    setCats(c);
    setImages(i);
  };
  useEffect(() => { load(); }, []);

  const catName = useMemo(() => Object.fromEntries((cats || []).map((c) => [c.id, c.name])), [cats]);
  const byCat = useMemo(() => {
    const m = {};
    for (const i of images || []) (m[i.category_id] ||= []).push(i);
    return m;
  }, [images]);
  const allList = useMemo(() => (images || []).filter((i) => catName[i.category_id] != null), [images, catName]);
  const listFor = (scope) => (scope === ALL ? allList : byCat[scope] || []);

  const toggle = (id) => setExpanded((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const expandAll = (on) => setExpanded(on ? new Set((cats || []).map((c) => c.id)) : new Set());

  const startUpload = (categoryId) => {
    uploadTarget.current = categoryId;
    fileRef.current.value = '';
    fileRef.current.click();
  };

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/'));
    const categoryId = uploadTarget.current;
    if (!files.length || !categoryId) return;
    setErr('');
    setExpanded((s) => new Set(s).add(categoryId));
    setUpload({ categoryId, done: 0, total: files.length });
    const failed = [];
    for (const [n, file] of files.entries()) {
      try {
        const img = await compressImage(file);
        await api.post('/api/catalog/images', { category_id: categoryId, ...img });
      } catch {
        failed.push(file.name);
      }
      setUpload({ categoryId, done: n + 1, total: files.length });
    }
    setUpload(null);
    if (failed.length) setErr(t('تعذّر رفع: {names}', { names: failed.join(t('، ')) }));
    await load();
  };

  const removeCategory = async (c) => {
    const n = (byCat[c.id] || []).length;
    const msg = n
      ? t('حذف التصنيف «{name}» وجميع صوره ({n})؟ لا يمكن التراجع.', { name: c.name, n })
      : t('حذف التصنيف «{name}»؟', { name: c.name });
    if (!confirm(msg)) return;
    await api.del(`/api/catalog/categories/${c.id}`);
    load();
  };

  // after a delete/move the viewed list may shrink: keep the index in range, close if empty
  const clampView = (nextImages) => setView((v) => {
    if (!v) return v;
    const len = nextImages.filter((i) => (v.scope === ALL ? catName[i.category_id] != null : i.category_id === v.scope)).length;
    return len ? { ...v, index: Math.min(v.index, len - 1) } : null;
  });

  const removeImage = async (img) => {
    if (!confirm(t('حذف هذه الصورة؟'))) return;
    await api.del(`/api/catalog/images/${img.id}`);
    const next = images.filter((x) => x.id !== img.id);
    setImages(next);
    clampView(next);
  };

  const moveImage = async (img, categoryId) => {
    await api.put(`/api/catalog/images/${img.id}`, { category_id: categoryId });
    const next = images.map((x) => (x.id === img.id ? { ...x, category_id: categoryId } : x));
    setImages(next);
    clampView(next);
  };

  const uploadBtn = (onClick, small) => (
    <button className={small ? 'btn-soft' : 'btn-primary'} disabled={!!upload} onClick={onClick}>
      <Upload size={small ? 15 : 16} /> {t('رفع صور')}
    </button>
  );
  const progress = upload && (
    <span className="flex items-center gap-2 text-sm font-bold text-brand-700">
      <Spinner className="h-4 w-4" /> {t('جارٍ رفع {done} من {total}', upload)}
    </span>
  );

  const loading = !cats || !images;
  const viewList = view ? listFor(view.scope) : [];

  return (
    <div>
      <PageHeader title={t('الكتالوج')} subtitle={t('صور الأعمال مصنفة حسب التصنيفات')}>
        <button className="btn-primary" onClick={() => setCatModal({})}><FolderPlus size={16} /> {t('إضافة تصنيف')}</button>
      </PageHeader>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-brand-500" /></div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <TabBtn active={tab === ALL} onClick={() => setTab(ALL)} label={t('كل الصور')} count={allList.length} />
            <TabBtn active={tab === CATS} onClick={() => setTab(CATS)} label={t('التصنيفات')} count={cats.length} />
          </div>
          {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}

          {cats.length === 0 ? (
            <Empty>
              <ImageIcon className="mx-auto mb-2" size={32} />
              {t('لا توجد تصنيفات بعد — أضف تصنيفاً مثل «الملابس» ثم ارفع صوره')}
            </Empty>
          ) : tab === ALL ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {uploadBtn(() => (cats.length === 1 ? startUpload(cats[0].id) : setPickCat(true)))}
                {progress}
              </div>
              {allList.length === 0 ? (
                <Empty><ImageIcon className="mx-auto mb-2" size={32} />{t('لا توجد صور بعد')}</Empty>
              ) : (
                <ImageGrid list={allList} label={(i) => catName[i.category_id]} onOpen={(index) => setView({ scope: ALL, index })} />
              )}
            </>
          ) : (
            <>
              <div className="mb-3 flex justify-end gap-3 text-sm font-bold text-brand-700">
                <button className="hover:underline" onClick={() => expandAll(true)}>{t('فتح الكل')}</button>
                <button className="hover:underline" onClick={() => expandAll(false)}>{t('إغلاق الكل')}</button>
              </div>
              <div className="space-y-3">
                {cats.map((c) => {
                  const imgs = byCat[c.id] || [];
                  const open = expanded.has(c.id);
                  return (
                    <div key={c.id} className="card overflow-hidden">
                      <div className="flex items-center gap-2 p-3">
                        <button onClick={() => toggle(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                          <ChevronDown size={20} className={`shrink-0 text-stone-400 transition ${open ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`} />
                          <Folder size={20} className="shrink-0 text-brand-600" />
                          <span className="truncate font-extrabold text-stone-800">{c.name}</span>
                          <span className="shrink-0 rounded-full bg-stone-100 px-2 text-xs font-bold text-stone-500">{imgs.length}</span>
                          {!open && imgs.length > 0 && (
                            <span className="hidden -space-x-2 rtl:space-x-reverse sm:flex">
                              {imgs.slice(0, 4).map((i) => (
                                <img key={i.id} src={i.thumb} alt="" className="h-7 w-7 rounded-md object-cover ring-2 ring-white" />
                              ))}
                            </span>
                          )}
                        </button>
                        <button title={t('رفع صور')} disabled={!!upload} onClick={() => startUpload(c.id)}
                          className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 disabled:opacity-40"><Upload size={17} /></button>
                        <button title={t('إعادة تسمية')} onClick={() => setCatModal(c)}
                          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><Pencil size={16} /></button>
                        <button title={t('حذف التصنيف')} onClick={() => removeCategory(c)}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                      </div>
                      {open && (
                        <div className="border-t border-stone-100 p-3">
                          {upload?.categoryId === c.id && <div className="mb-3">{progress}</div>}
                          {imgs.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-6 text-sm text-stone-400">
                              {t('لا توجد صور في هذا التصنيف بعد')}
                              {uploadBtn(() => startUpload(c.id), true)}
                            </div>
                          ) : (
                            <ImageGrid list={imgs} onOpen={(index) => setView({ scope: c.id, index })} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {catModal && (
        <CategoryModal item={catModal} onClose={() => setCatModal(null)}
          onSaved={async (c) => {
            setCatModal(null);
            await load();
            setTab(CATS);
            setExpanded((s) => new Set(s).add(c.id));
          }} />
      )}

      {pickCat && (
        <PickCategoryModal cats={cats} onClose={() => setPickCat(false)}
          onPick={(id) => { setPickCat(false); startUpload(id); }} />
      )}

      {view && viewList[view.index] && (
        <Viewer
          list={viewList} index={view.index}
          setIndex={(f) => setView((v) => ({ ...v, index: typeof f === 'function' ? f(v.index) : f }))}
          cats={cats} catName={catName}
          onClose={() => setView(null)} onDelete={removeImage} onMove={moveImage}
        />
      )}
    </div>
  );
}

function ImageGrid({ list, label, onOpen }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {list.map((img, i) => (
        <button key={img.id} onClick={() => onOpen(i)}
          className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200 transition hover:ring-2 hover:ring-brand-400">
          <img src={img.thumb} alt={img.name || ''} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          {label && (
            <span className="absolute bottom-1.5 start-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{label(img)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function TabBtn({ active, onClick, label, count }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-brand-600 text-white' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
      }`}>
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/25' : 'bg-stone-100 text-stone-500'}`}>{count}</span>
    </button>
  );
}

function CategoryModal({ item, onClose, onSaved }) {
  const [name, setName] = useState(item.name || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const c = item.id
        ? await api.put(`/api/catalog/categories/${item.id}`, { name })
        : await api.post('/api/catalog/categories', { name });
      onSaved(c);
    } catch (e2) {
      setErr(e2.message);
      setSaving(false);
    }
  };
  return (
    <Modal open size="sm" title={item.id ? t('إعادة تسمية التصنيف') : t('إضافة تصنيف')} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{err}</div>}
        <Field label={t('اسم التصنيف')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required placeholder={t('مثال: الملابس')} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-soft" onClick={onClose}>{t('إلغاء')}</button>
          <button className="btn-primary" disabled={saving}>{saving ? <Spinner className="h-5 w-5" /> : t('حفظ')}</button>
        </div>
      </form>
    </Modal>
  );
}

function PickCategoryModal({ cats, onClose, onPick }) {
  const [id, setId] = useState(cats[0]?.id || '');
  return (
    <Modal open size="sm" title={t('رفع صور')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('اختر التصنيف')}>
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn-soft" onClick={onClose}>{t('إلغاء')}</button>
          <button className="btn-primary" disabled={!id} onClick={() => onPick(id)}><Upload size={16} /> {t('اختيار الصور')}</button>
        </div>
      </div>
    </Modal>
  );
}

// Full-screen image viewer with prev/next, move-to-category, download and delete.
function Viewer({ list, index, setIndex, cats, catName, onClose, onDelete, onMove }) {
  const img = list[index];
  const [full, setFull] = useState({});
  useEffect(() => {
    if (full[img.id]) return;
    let alive = true;
    api.get(`/api/catalog/images/${img.id}/full`).then((r) => alive && setFull((s) => ({ ...s, [img.id]: r.data }))).catch(() => {});
    return () => { alive = false; };
  }, [img.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prev = () => setIndex((i) => (i - 1 + list.length) % list.length);
  const next = () => setIndex((i) => (i + 1) % list.length);
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      // arrow keys follow reading direction
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') (rtl ? prev : next)();
      if (e.key === 'ArrowLeft') (rtl ? next : prev)();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const src = full[img.id] || img.thumb;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{index + 1} / {list.length}</span>
          <select className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-bold text-white"
            value={img.category_id} onChange={(e) => onMove(img, e.target.value)} title={t('نقل إلى تصنيف')}>
            {cats.map((c) => <option key={c.id} value={c.id} className="text-stone-800">{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <a href={src} download={`${catName[img.category_id] || 'image'}-${index + 1}.jpg`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" title={t('تنزيل')}>
            <Download size={18} />
          </a>
          <button onClick={() => onDelete(img)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-red-300 hover:bg-red-500/40" title={t('حذف')}>
            <Trash2 size={18} />
          </button>
          <button onClick={onClose} aria-label="close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        <img src={src} alt={img.name || ''} className="max-h-full max-w-full rounded-lg object-contain" />
        {!full[img.id] && <Spinner className="absolute h-8 w-8 text-white/70" />}
        {list.length > 1 && (
          <>
            <button onClick={prev} className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
              <ChevronRight size={26} className="ltr:rotate-180" />
            </button>
            <button onClick={next} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
              <ChevronLeft size={26} className="ltr:rotate-180" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
