import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

type MediaKind = 'image' | 'video' | 'unknown';

interface MatchItem {
  // ID we use in UI (unique); when filePath missing we fall back to downloadUrl
  id: string;

  // From backend (you currently return fileName + downloadUrl)
  filePath?: string;            // optional (if not provided by backend)
  name?: string;                // fileName
  size?: number;                // optional if available
  downloadUrl?: string;         // SharePoint temp URL

  // Optional if you later add
  thumbnailUrl?: string;
  previewUrl?: string;
  username?: string;            // or email

  kind: MediaKind;

  // Computed for UI
  viewSrc?: string;             // what <img>/<video> uses (proxied)
}

@Component({
  selector: 'app-data-ai',
  templateUrl: './data-ai.component.html',
  styleUrls: ['./data-ai.component.css']
})
export class DataAiComponent {
  constructor(private http: HttpClient, private host: ElementRef) {}

  // Backend base
  private readonly BASE = 'https://datakavach.com/isparxcloud';
  private readonly ACCESS_URL = `${this.BASE}/access-photos`;
  private readonly DOWNLOAD_URL = `${this.BASE}/download-photos`;
  private readonly PROXY_URL = `${this.BASE}/proxy-media`;

  // Camera refs
  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl?: ElementRef<HTMLCanvasElement>;
  private stream: MediaStream | null = null;

  // UI state
  useCamera = false;
  linkInput = '';
  linkId: string | null = null;
  selfieFile: File | null = null;

  matched: MatchItem[] = [];
  selected = new Set<string>();

  query = '';
  sort: 'name' | 'size' = 'name';
  tile = 220;
  skeletons = Array.from({ length: 10 });

  submitting = false;
  downloading = false;
  dragOver = false;
  errorMsg: string | null = null;

  preview: MatchItem | null = null;
  toasts: string[] = [];

  // ===== Camera =====
  async switchMode(toCamera: boolean) {
    this.useCamera = toCamera;
    if (toCamera) await this.startCamera(); else this.stopCamera();
  }
  async startCamera() {
    try {
      this.stopCamera();
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (this.videoEl?.nativeElement) this.videoEl.nativeElement.srcObject = this.stream;
      this.toast('Camera ready. Hit Capture.');
    } catch (e:any) {
      this.toast('Could not access camera: ' + (e?.message || 'Permission denied'));
      this.useCamera = false;
    }
  }
  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.videoEl?.nativeElement) this.videoEl.nativeElement.srcObject = null;
  }
  async captureFrame() {
    if (!this.videoEl?.nativeElement) return;
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl?.nativeElement; if (!canvas) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 640;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) { this.toast('Failed to capture. Try again.'); return; }
    this.selfieFile = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
    this.toast('Captured!');
  }

  // ===== File upload =====
  onFilePicked(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const f = input.files && input.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return this.toast('Please choose an image (JPG/PNG).');
    if (f.size > 10 * 1024 * 1024) return this.toast('Max file size is 10 MB.');
    this.selfieFile = f;
  }
  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.dragOver = false; }
  onDrop(e: DragEvent) {
    e.preventDefault(); this.dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return this.toast('Please drop an image (JPG/PNG).');
    if (f.size > 10 * 1024 * 1024) return this.toast('Max file size is 10 MB.');
    this.selfieFile = f;
  }

  // ===== Submit -> matches -> previews =====
  async onSubmit(e: Event) {
    e.preventDefault();
    this.errorMsg = null;

    const id = this.extractLinkId(this.linkInput);
    if (!id) { this.toast('Please paste a valid share URL or Link ID.'); return; }
    if (!this.selfieFile) { this.toast('Please choose a face photo or capture one.'); return; }

    this.linkId = id;
    this.submitting = true;
    this.matched = [];
    this.selected.clear();

    try {
      const fd = new FormData();
      fd.append('linkId', id);
      fd.append('selfie', this.selfieFile);

      // Response like: [{ fileName, downloadUrl }, ...]
      const res = await this.http.post<any[]>(this.ACCESS_URL, fd).toPromise();
      const normalized = this.normalize(res || []);
      this.ensureProxyViewSources(normalized);  // <— use backend proxy
      this.matched = normalized;

      if (!this.matched.length) this.toast('No matches found. Try a clearer, well-lit face photo.');
    } catch (err) {
      this.errorMsg = this.parseErr(err);
      this.toast(this.errorMsg);
    } finally {
      this.submitting = false;
    }
  }

  // Build proxied preview src from downloadUrl
  private ensureProxyViewSources(items: MatchItem[]) {
    for (const m of items) {
      if (!m.viewSrc) {
        if (m.thumbnailUrl) {
          m.viewSrc = m.thumbnailUrl;
        } else if (m.downloadUrl) {
          m.viewSrc = `${this.PROXY_URL}?url=${encodeURIComponent(m.downloadUrl)}`;
        } else {
          m.viewSrc = ''; // will show placeholder
        }
      }
    }
  }

  // ===== Selection & bulk =====
  get canBulkDownload(): boolean {
    // We can only POST /download-photos with real OneDrive paths.
    // Hide bulk bar if items lack filePath (your current payload doesn't include it).
    return this.matched.every(m => !!m.filePath);
  }

  toggleOne(id: string, ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    on ? this.selected.add(id) : this.selected.delete(id);
  }
  toggleAll(on: boolean) {
    on ? this.matched.forEach(m => this.selected.add(m.id)) : this.selected.clear();
  }

  async downloadSelected() {
    if (!this.linkId || this.selected.size === 0 || !this.canBulkDownload) return;
    this.downloading = true;
    try {
      const form = new FormData();
      form.append('linkId', this.linkId);
      // Collect filePaths only
      for (const m of this.matched) {
        if (this.selected.has(m.id) && m.filePath) form.append('filePaths', m.filePath);
      }
      const blob = await this.http.post(this.DOWNLOAD_URL, form, { responseType: 'blob' }).toPromise();
      if (!blob) throw new Error('Empty response');
      this.saveBlob(blob, `my-photos-${new Date().toISOString().slice(0,10)}.zip`);
    } catch (err) {
      this.toast(this.parseErr(err));
    } finally {
      this.downloading = false;
    }
  }

  // ===== Filter / sort =====
  filtered(): MatchItem[] {
    const q = this.query.trim().toLowerCase();
    let arr = this.matched;
    if (q) arr = arr.filter(m => (m.name || 'file').toLowerCase().includes(q));
    if (this.sort === 'name') {
      arr = [...arr].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      arr = [...arr].sort((a,b) => (b.size || 0) - (a.size || 0));
    }
    return arr;
  }

  // ===== Preview =====
  openPreview(m: MatchItem) { this.preview = m; }
  closePreview(_: MouseEvent) { this.preview = null; }

  // ===== Reset =====
  resetAll() {
    this.linkInput = ''; this.linkId = null; this.selfieFile = null;
    this.matched = []; this.selected.clear();
    this.query = ''; this.sort = 'name'; this.tile = 220;
    this.submitting = false; this.downloading = false; this.dragOver = false; this.errorMsg = null;
    this.preview = null; this.toasts = [];
    this.stopCamera(); this.useCamera = false;
  }

  // ===== Normalize backend (fileName + downloadUrl) =====
  private normalize(items: any[]): MatchItem[] {
    return items.map((x, idx) => {
      const name = (x.fileName || 'file').toString();
      const downloadUrl = (x.downloadUrl || '').toString();
      // Use provided filePath if your backend starts returning it; else undefined
      const filePath = x.filePath ? String(x.filePath) : undefined;
      const kind = this.kindFromName(name);
      // ID used for selection (unique). Prefer filePath; else fall back to downloadUrl; else index.
      const id = filePath || downloadUrl || `idx-${idx}`;
      const m: MatchItem = { id, filePath, name, downloadUrl, kind };
      return m;
    });
  }

  // ===== Utils =====
  extractLinkId(input: string): string | null {
    const s = (input || '').trim();
    if (/^[A-Za-z0-9._-]{12,}$/.test(s)) return s;
    try { const u = new URL(s); return (u.searchParams.get('token') || u.searchParams.get('linkId'))?.trim() || null; }
    catch { return null; }
  }
  humanSize(n?: number): string { if (n == null) return ''; const u = ['B','KB','MB','GB']; let i=0,v=n; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(v<10&&i>0?1:0)} ${u[i]}`; }
  kindFromName(name:string):MediaKind{ const n=name.toLowerCase(); if(/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(n))return 'image'; if(/\.(mp4|mov|wmv|avi|mkv|webm)$/.test(n))return 'video'; return 'unknown'; }
  saveBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),0); }

  parseErr(err:any):string{
    if(err instanceof HttpErrorResponse){
      const fromBody=(typeof err.error==='string')?err.error:(err.error?.error||'');
      if(fromBody) return this.stripJsonError(fromBody);
      return err.message||`Request failed (${err.status})`;
    }
    return err?.message?String(err.message):'Something went wrong.';
  }
  stripJsonError(s:string){ return s.replace(/^{\"error\":\s*\"?|\"?\}\s*$/g,'').trim(); }
  toast(m:string){ if(!m) return; this.toasts.push(m); const i=this.toasts.length-1; setTimeout(()=>{ this.toasts.splice(i,1); },3500); }

  trackById=(_:number,m:MatchItem)=>m.id;

  @HostListener('document:keydown.escape') onEsc(){ if(this.preview) this.preview=null; }
  @HostListener('window:beforeunload') ngOnDestroy(){ this.stopCamera(); }
}
