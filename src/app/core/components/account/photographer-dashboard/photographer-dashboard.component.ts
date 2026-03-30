import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

const BASE_URL = 'https://datakavach.com/isparxcloud';

type RootFolder = {
  name: string;
  path?: string;
};

type DriveItem = {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  webUrl?: string;
};

@Component({
  selector: 'app-photographer-dashboard',
  templateUrl: './photographer-dashboard.component.html',
  styleUrls: ['./photographer-dashboard.component.css']
})
export class PhotographerDashboardComponent implements OnInit {
  userSessionDetails: userSessionDetails | null | undefined;
  headers!: HttpHeaders;

  isLoading = true;
  error = '';

  events: RootFolder[] = [];
  selectedEvent = '';

  contents: DriveItem[] = [];
  loadingContents = false;
  breadcrumb: string[] = [];

  sharing = false;
  shareLink = '';

  newEventName = '';
  dirFiles: File[] = [];
  uploading = false;
  uploadMsg = '';
  isSuccess = false;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.auth.getLoggedInUserDetails();

    if (!this.userSessionDetails?.jwtToken || !this.userSessionDetails?.username) {
      this.router.navigate(['/login']);
      return;
    }
    this.headers = new HttpHeaders({
      Authorization: `Bearer ${this.userSessionDetails.jwtToken}`
    });

    this.loadRootEvents().finally(() => (this.isLoading = false));
  }

  private get username(): string {
    return this.userSessionDetails?.username || '';
  }

  async loadRootEvents() {
    this.events = [];
    this.selectedEvent = '';
    this.contents = [];
    this.error = '';
    this.breadcrumb = [];

    try {
      const params = new HttpParams().set('username', this.username);
      const resp = await this.http.get<{ folders: any[]; nextLink?: string; error?: string }>(
        `${BASE_URL}/folders`,
        { params, headers: this.headers }
      ).toPromise();

      if ((resp as any)?.error) throw new Error((resp as any).error);

      const folders = (resp?.folders || []) as any[];
      this.events = folders.map(f => ({ name: (f.name || f.folderName || '').trim(), path: f.path }));

      if (this.events.length > 0) {
        this.selectEvent(this.events[0].name);
      }
    } catch (e) {
      this.handleHttpError(e, 'Failed to load events.');
    }
  }

  selectEvent(eventName: string) {
    this.selectedEvent = eventName;
    this.shareLink = '';
    this.breadcrumb = [eventName];
    this.loadImmediateChildren();
  }

  loadImmediateChildren() {
    if (!this.selectedEvent) return;
    this.loadingContents = true;
    this.contents = [];

    const params = new HttpParams()
      .set('username', this.username)
      .set('folderName', this.selectedEvent);

    this.http.get<{ files: any[]; nextLink?: string; error?: string }>(
      `${BASE_URL}/files`,
      { params, headers: this.headers }
    ).subscribe({
      next: (resp) => {
        if ((resp as any)?.error) throw new Error((resp as any).error);
        const list = (resp.files || []) as any[];
        this.contents = list.map((x) => ({
          name: x.name,
          path: `${this.selectedEvent}/${x.name}`,
          isFolder: !!x.isFolder,
          size: x.size,
          webUrl: x.webUrl
        }));
        this.loadingContents = false;
      },
      error: (e) => {
        this.loadingContents = false;
        this.handleHttpError(e, `Failed to list contents for "${this.selectedEvent}".`);
      }
    });
  }

  openFolder(item: DriveItem) {
    if (!item.isFolder) return;
    const fullPath = item.path;
    this.loadingContents = true;
    this.contents = [];
    this.breadcrumb = fullPath.split('/').filter(Boolean);

    const params = new HttpParams()
      .set('username', this.username)
      .set('folderPath', fullPath);

    this.http.get<{ contents: any[]; nextLink?: string; error?: string }>(
      `${BASE_URL}/folder-contents`,
      { params, headers: this.headers }
    ).subscribe({
      next: (resp) => {
        if ((resp as any)?.error) throw new Error((resp as any).error);
        const list = (resp.contents || []) as any[];
        this.contents = list.map((x) => ({
          name: x.name,
          path: `${fullPath}/${x.name}`,
          isFolder: !!x.isFolder,
          size: x.size,
          webUrl: x.webUrl
        }));
        this.loadingContents = false;
      },
      error: (e) => {
        this.loadingContents = false;
        this.handleHttpError(e, `Failed to open ${fullPath}.`);
      }
    });
  }

  onCrumb(index: number) {
    const parts = this.breadcrumb.slice(0, index + 1);
    if (parts.length === 1) {
      this.selectEvent(parts[0]);
    } else {
      const fullPath = parts.join('/');
      const dummy: DriveItem = { name: parts[parts.length - 1], path: fullPath, isFolder: true };
      this.openFolder(dummy);
    }
  }

  async shareEvent() {
    if (!this.selectedEvent) return;
    this.sharing = true;
    this.shareLink = '';
    try {
      const body = new URLSearchParams();
      body.set('email', this.username);
      body.set('folderPath', this.selectedEvent);

      const resp = await this.http.post<{ shareLink: string; error?: string }>(
        `${BASE_URL}/share-photographer-folder`,
        body.toString(),
        { headers: this.headers.set('Content-Type', 'application/x-www-form-urlencoded') }
      ).toPromise();

      if ((resp as any)?.error) throw new Error((resp as any).error);

      this.shareLink = resp?.shareLink || '';
      this.sharing = false;
    } catch (e) {
      this.sharing = false;
      this.handleHttpError(e, 'Failed to generate share link.');
    }
  }

  copyShare() {
    if (!this.shareLink) return;
    navigator.clipboard.writeText(this.shareLink);
  }

  onPickDirectory(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files) return;
    this.dirFiles = Array.from(input.files);
    this.uploadMsg = '';
    this.isSuccess = false;
  }

  async uploadDirectoryToNewEvent() {
    const eventName = (this.newEventName || '').trim();
    if (!eventName || this.dirFiles.length === 0) return;

    this.uploading = true;
    this.uploadMsg = '';
    this.isSuccess = false;

    try {
      const form = new FormData();
      for (const f of this.dirFiles) {
        form.append('files', f, f.name);
      }
      form.append('email', this.username);
      form.append('baseFolderName', eventName);

      for (const f of this.dirFiles) {
        const wrp = (f as any).webkitRelativePath || f.name;
        const parts = wrp.split('/').filter(Boolean);
        const rel = parts.length > 1 ? parts.slice(1, parts.length - 1).join('/') : '';
        form.append('relativePaths', rel);
      }

      const resp = await this.http.post<{ successUrls: any[]; errorMessages: any[] }>(
        `${BASE_URL}/upload-photographer-images`,
        form,
        { headers: this.headers }
      ).toPromise();

      const ok = resp?.successUrls?.length || 0;
      const bad = resp?.errorMessages?.length || 0;
      this.isSuccess = bad === 0 && ok > 0;
      this.uploadMsg = `Uploaded. Success: ${ok}${bad ? `, Errors: ${bad}` : ''}`;

      await this.loadRootEvents();
      this.selectEvent(eventName);

      this.dirFiles = [];
      this.newEventName = '';
      this.uploading = false;
    } catch (e) {
      this.uploading = false;
      this.handleHttpError(e, 'Failed to upload folder to new event.');
    }
  }

  async deleteItem(it: DriveItem) {
    if (!confirm(`Delete ${it.isFolder ? 'folder' : 'file'} "${it.name}"?`)) return;

    const params = new HttpParams()
      .set('username', this.username)
      .set('itemPath', it.path)
      .set('isFolder', String(it.isFolder));

    try {
      await this.http.delete<{ message: string; error?: string }>(
        `${BASE_URL}/delete-item`,
        { params, headers: this.headers }
      ).toPromise();

      if (this.breadcrumb.length === 1) {
        this.loadImmediateChildren();
      } else {
        const fullPath = this.breadcrumb.join('/');
        const dummy: DriveItem = { name: this.breadcrumb[this.breadcrumb.length - 1], path: fullPath, isFolder: true };
        this.openFolder(dummy);
      }
    } catch (e) {
      this.handleHttpError(e, `Failed to delete ${it.name}.`);
    }
  }

  thumbSrc(item: DriveItem) {
    if (item.isFolder) return null;
    const user = encodeURIComponent(this.username);
    const path = encodeURIComponent(item.path);
    return `${BASE_URL}/thumbnail?username=${user}&filePath=${path}`;
  }

  videoSrc(item: DriveItem) {
    if (item.isFolder) return null;
    const user = encodeURIComponent(this.username);
    const path = encodeURIComponent(item.path);
    return `${BASE_URL}/video-preview?username=${user}&filePath=${path}`;
  }

  private handleHttpError(e: unknown, fallback: string) {
    const err = e as HttpErrorResponse;
    this.error = (err?.error?.error as string) || err?.message || fallback;
    console.error(this.error, e);
  }
}