import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Subscription } from 'rxjs';
import { retry, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

interface BackupSchedule {
  scheduleId: number;
  userId: number;
  cloudProvider: string;
  filePath: string;
  localFilePath: string;
  backupTime: string;
  retentionDays: number;
  backupFrequency: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
  isActive: boolean;
  lastBackupTime?: string | null;
  nextBackupTime: string;
  lastError?: string | null;
  retryCount: number;
}

interface FileInfo {
  type: string;
  name: string;
  id: string;
  downloadUrl: string;
}

interface FolderInfo {
  name: string;
  id: string;
  size: number;
  path: string;
  children?: FolderInfo[];
  isExpanded?: boolean;
}

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css']
})
export class UploadComponent implements OnInit, OnDestroy {
onFrequencyChange() {
throw new Error('Method not implemented.');
}
  folderName: string = '';
  fileName: string = '';
  fileNameError: string = '';
  localPath: string = '';
  backupTime: string = '';
  retentionDays: number = 7;
  backupFrequency: string = 'Daily';
  dayOfWeek: string = '';
  dayOfMonth: number | null = null;
  selectedFiles: File[] = [];
  uploading: boolean = false;
  scheduling: boolean = false;
  overallProgress: number = 0;
  currentFileIndex: number = 0;
  message: string = '';
  isSuccess: boolean = false;
  userSessionDetails: userSessionDetails | null | undefined = null;
  private readonly CHUNK_SIZE = 20 * 1024 * 1024;
  private uploadSessionId: string | null = null;
  backupSchedules: BackupSchedule[] = [];
  rootFolders: FolderInfo[] = [];
  currentFolders: FolderInfo[] = [];
  folderPathSegments: string[] = [];
  needsBackup: 'yes' | 'no' = 'yes';
  isLoading: boolean = true;
  isLoadingFolders: boolean = false;
  isSchedulesLoading: boolean = false;
  files: FileInfo[] = [];
  private subscriptions: Subscription[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeUser();
  }

  async initializeUser() {
    this.message = '';
    this.userSessionDetails = this.authService.getLoggedInUserDetails();

    if (!this.userSessionDetails?.jwtToken || !this.userSessionDetails?.username) {
      const url = `https://datakavach.com/users/current`;
      try {
        console.log('Fetching user details:', url);
        const response = await this.http.get<userSessionDetails>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        console.log('User details:', response);
        this.userSessionDetails = response;
      } catch (err: any) {
        this.handleError(err, 'Failed to fetch user details');
        this.userSessionDetails = null;
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }
    }

    if (this.userSessionDetails?.jwtToken && this.userSessionDetails?.username) {
      this.loadBackupSchedules();
      await this.loadRootFolders();
      this.currentFolders = this.rootFolders;
    } else {
      this.message = 'Invalid user session. Please log in again.';
      this.isSuccess = false;
    }

    this.isLoading = false;
    this.cdr.detectChanges();
  }

  onBackupChoiceChange() {
    if (this.needsBackup === 'no') {
      this.localPath = '';
      this.backupTime = '';
      this.retentionDays = 7;
      this.backupFrequency = 'Daily';
      this.dayOfWeek = '';
      this.dayOfMonth = null;
    }
    this.message = '';
    this.cdr.detectChanges();
  }

  validateFileNameInput(): void {
    this.fileNameError = '';
    if (!this.fileName) {
      this.fileNameError = 'File name is required';
    } else if (/[<>:\"\/\\|?*\x00-\x1F]/.test(this.fileName)) {
      this.fileNameError = 'File name contains invalid characters';
    } else if (this.fileName.length > 255) {
      this.fileNameError = 'File name exceeds 255 characters';
    }
    this.cdr.detectChanges();
  }

  onFilesSelected(event: any) {
    this.selectedFiles = Array.from(event.target.files);
    this.message = '';
    this.overallProgress = 0;
    this.currentFileIndex = 0;
    this.uploadSessionId = null;

    if (this.selectedFiles.length > 0) {
      this.fileName = this.selectedFiles[0].name;
      this.validateFileNameInput();
    }
    this.cdr.detectChanges();
  }

  isScheduleFormValid(): boolean {
    if (this.needsBackup === 'no') {
      return !!(
        this.userSessionDetails?.username &&
        this.folderName &&
        this.fileName &&
        !this.fileNameError &&
        this.selectedFiles.length > 0
      );
    }
    return !!(
      this.userSessionDetails?.username &&
      this.folderName &&
      this.fileName &&
      !this.fileNameError &&
      this.localPath &&
      this.backupTime &&
      this.retentionDays > 0 &&
      this.backupFrequency &&
      (this.backupFrequency !== 'Weekly' || this.dayOfWeek) &&
      (this.backupFrequency !== 'Monthly' || (this.dayOfMonth && this.dayOfMonth >= 1 && this.dayOfMonth <= 31))
    );
  }

  selectFolder(path: string, event: Event) {
    event.preventDefault();
    this.folderName = path;
    this.folderPathSegments = path ? path.split('/') : [];
    this.loadFolderContents(path);
    this.cdr.detectChanges();
  }

  navigateToPathSegment(index: number, event: Event) {
    event.preventDefault();
    const newPath = this.folderPathSegments.slice(0, index + 1).join('/');
    this.folderName = newPath;
    this.folderPathSegments = newPath ? newPath.split('/') : [];
    this.loadFolderContents(newPath);
    this.cdr.detectChanges();
  }

  async toggleFolder(folder: FolderInfo, event: Event) {
    event.preventDefault();
    if (!folder.isExpanded && !folder.children) {
      await this.loadSubFolders(folder.id, folder.path, folder);
    }
    folder.isExpanded = !folder.isExpanded;
    this.currentFolders = [folder];
    this.cdr.detectChanges();
  }

  async onCreateSchedule() {
    if (!this.isScheduleFormValid()) {
      this.message = 'Please fill all required fields correctly';
      this.isSuccess = false;
      this.cdr.detectChanges();
      return;
    }

    this.scheduling = true;
    this.message = '';

    const url = 'https://datakavach.com/onedrive/schedule';
    const body = new FormData();
    body.append('username', this.userSessionDetails!.username);
    body.append('folderPath', this.folderName);
    body.append('fileName', this.fileName);
    body.append('localPath', this.localPath);
    body.append('backupTime', this.backupTime + ':00');
    body.append('retentionDays', this.retentionDays.toString());
    body.append('backupFrequency', this.backupFrequency);
    if (this.dayOfWeek) body.append('dayOfWeek', this.dayOfWeek);
    if (this.dayOfMonth) body.append('dayOfMonth', this.dayOfMonth.toString());

    try {
      console.log('Creating schedule:', {
        username: this.userSessionDetails!.username,
        folderPath: this.folderName
      });
      await this.http.post(url, body, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.message = 'Backup schedule created successfully';
      this.isSuccess = true;

      await this.loadBackupSchedules();

      if (this.selectedFiles.length > 0) {
        await this.onUpload();
      } else {
        this.handleSuccess('Backup schedule created');
      }
    } catch (err: any) {
      this.handleError(err, 'Failed to create schedule');
    } finally {
      this.scheduling = false;
      this.cdr.detectChanges();
    }
  }

  async triggerManualBackup(scheduleId: number) {
    const url = 'https://datakavach.com/onedrive/backup-now';
    const body = new FormData();
    body.append('scheduleId', scheduleId.toString());
    body.append('username', this.userSessionDetails!.username);

    try {
      await this.http.post(url, body, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.message = `Manual backup triggered for schedule ID: ${scheduleId}`;
      this.isSuccess = true;
      setTimeout(() => this.loadBackupSchedules(), 3000);
    } catch (err: any) {
      this.handleError(err, 'Failed to trigger manual backup');
    }
    this.cdr.detectChanges();
  }

  async loadBackupSchedules() {
    if (!this.userSessionDetails?.username) {
      this.backupSchedules = [];
      return;
    }

    this.isSchedulesLoading = true;
    this.message = '';
    const url = `https://datakavach.com/onedrive/schedules?username=${encodeURIComponent(this.userSessionDetails.username)}`;

    try {
      const response = await this.http.get<{ schedules: BackupSchedule[] }>(url, {
        headers: this.getAuthHeaders()
      }).pipe(
        retry({ count: 2, delay: 1000 }),
        catchError(err => this.handleApiError(err, 'Failed to load schedules'))
      ).toPromise();
      this.backupSchedules = response?.schedules || [];
      if (this.backupSchedules.length === 0) {
        this.message = 'No backup schedules found.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      this.backupSchedules = [];
    } finally {
      this.isSchedulesLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadRootFolders() {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
      this.rootFolders = [];
      this.cdr.detectChanges();
      return;
    }

    this.isLoadingFolders = true;
    this.rootFolders = [];
    const url = `https://datakavach.com/onedrive/folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;

    try {
      console.log('Fetching root folders:', url);
      const response = await this.http.get<{ folders: FolderInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).pipe(
        retry({ count: 2, delay: 1000 }),
        catchError(err => this.handleApiError(err, 'Failed to load folders'))
      ).toPromise();
      console.log('Root folders response:', response);

      if (!response?.folders) {
        throw new Error('Invalid response format');
      }

      this.rootFolders = response.folders.map(f => ({
        ...f,
        path: f.name,
        children: [],
        isExpanded: false
      }));

      if (this.rootFolders.length === 0) {
        this.message = 'No folders found in OneDrive.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      this.handleError(err, 'Failed to load folders');
      this.rootFolders = [];
    } finally {
      this.isLoadingFolders = false;
      this.cdr.detectChanges();
    }
  }

  async loadSubFolders(parentId: string, parentPath: string, parentFolder: FolderInfo) {
    const url = `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.userSessionDetails!.username)}&folderPath=${encodeURIComponent(parentPath)}`;
    try {
      console.log(`Fetching subfolders for ${parentPath}:`, url);
      const response = await this.http.get<{ contents: { name: string, type: 'file' | 'folder', id: string, size?: number }[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).pipe(
        retry({ count: 2, delay: 1000 }),
        catchError(err => this.handleApiError(err, `Failed to load subfolders for ${parentPath}`))
      ).toPromise();
      console.log(`Subfolders response for ${parentPath}:`, response);

      parentFolder.children = response?.contents
        .filter(item => item.type === 'folder')
        .map(item => ({
          name: item.name,
          id: item.id,
          size: item.size || 0,
          path: `${parentPath}/${item.name}`,
          children: [],
          isExpanded: false
        })) || [];
    } catch (err: any) {
      console.warn(`Failed to load subfolders for ${parentPath}:`, err);
    }
  }

  async loadFolderContents(folderPath: string) {
    if (!this.userSessionDetails?.username) {
      this.files = [];
      return;
    }

    this.files = [];
    const url = folderPath
      ? `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.userSessionDetails.username)}&folderPath=${encodeURIComponent(folderPath)}`
      : `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.userSessionDetails.username)}&folderPath=root`;

    try {
      const response = await this.http.get<{ contents: FileInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).pipe(
        retry({ count: 2, delay: 1000 }),
        catchError(err => this.handleApiError(err, 'Failed to load folder contents'))
      ).toPromise();
      this.files = response?.contents.filter(item => item.type === 'file') || [];
    } catch (err: any) {
      this.handleError(err, 'Failed to load folder contents');
      this.files = [];
    }
  }

  async onUpload() {
    if (!this.userSessionDetails?.username || !this.folderName || this.selectedFiles.length === 0) {
      this.message = 'Please select a folder and at least one file';
      this.isSuccess = false;
      this.uploading = false;
      this.cdr.detectChanges();
      return;
    }

    this.uploading = true;
    this.overallProgress = 0;
    this.currentFileIndex = 0;
    this.message = '';

    const totalSize = this.selectedFiles.reduce((sum, file) => sum + file.size, 0);
    let uploadedSize = 0;

    for (let i = 0; i < this.selectedFiles.length; i++) {
      this.currentFileIndex = i;
      const file = this.selectedFiles[i];
      const rawFileName = file.name;
      const fileSize = file.size;
      const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);

      this.uploadSessionId = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
        const chunk = file.slice(startByte, endByte + 1);
        const chunkSize = endByte - startByte + 1;

        const formData = new FormData();
        formData.append('username', this.userSessionDetails!.username);
        formData.append('folderPath', this.folderName);
        formData.append('file', chunk, rawFileName);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('startByte', startByte.toString());
        formData.append('endByte', endByte.toString());
        formData.append('totalSize', fileSize.toString());
        if (this.uploadSessionId) {
          formData.append('sessionId', this.uploadSessionId);
        }

        const url = `https://datakavach.com/onedrive/upload/${encodeURIComponent(rawFileName)}`;

        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
          try {
            const response = await this.uploadChunk(url, formData, chunkIndex, totalChunks, fileSize, totalSize, uploadedSize);
            if (chunkIndex === 0 && response.sessionId) {
              this.uploadSessionId = response.sessionId;
            }
            uploadedSize += chunkSize;
            this.overallProgress = Math.round((uploadedSize / totalSize) * 100);
            break;
          } catch (err: any) {
            if (err.status === 400 && err.error?.message.includes('session expired') && retryCount < maxRetries) {
              this.uploadSessionId = null;
              retryCount++;
              continue;
            }
            this.handleError(err, 'Failed to upload chunk');
            this.uploading = false;
            this.cdr.detectChanges();
            return;
          }
        }
      }
    }

    this.handleSuccess('All files uploaded successfully');
    this.loadFolderContents(this.folderName);
    this.cdr.detectChanges();
  }

  private uploadChunk(url: string, formData: FormData, chunkIndex: number, totalChunks: number, fileSize: number, totalSize: number, uploadedSize: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.put(url, formData, {
        headers: this.getAuthHeaders(),
        reportProgress: true,
        observe: 'events'
      }).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const currentFileUploaded = uploadedSize + event.loaded;
            this.overallProgress = Math.round((currentFileUploaded / totalSize) * 100);
            this.cdr.detectChanges();
          } else if (event.type === HttpEventType.Response) {
            resolve(event.body);
          }
        },
        error: (err) => reject(err)
      });
    });
  }

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.userSessionDetails?.jwtToken || ''}`
    });
  }

  private handleSuccess(message: string) {
    this.uploading = false;
    this.scheduling = false;
    this.isSuccess = true;
    this.message = message;

    const modalElement = document.getElementById('successModal');
    if (modalElement) {
      // @ts-ignore
      const bootstrapModal = new bootstrap.Modal(modalElement);
      bootstrapModal.show();
    }

    this.resetForm();
    this.cdr.detectChanges();
  }

  private handleError(error: any, defaultMessage: string) {
    this.uploading = false;
    this.scheduling = false;
    this.isSuccess = false;
    let errorMessage = defaultMessage;
    if (error.status === 401) {
      errorMessage = 'Authentication failed. Please log in again.';
    } else if (error.status === 404) {
      errorMessage = 'Resource not found.';
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    this.message = errorMessage;
    console.error(errorMessage, error);
    this.cdr.detectChanges();
  }

  private handleApiError(err: any, defaultMessage: string) {
    let errorMessage = defaultMessage;
    if (err.status === 401) {
      errorMessage = 'Authentication failed. Please log in again.';
    } else if (err.status === 404) {
      errorMessage = 'Resource not found.';
    } else if (err.status === 500) {
      errorMessage = 'Server error. Please try again later.';
    } else if (err.error?.error) {
      errorMessage = err.error.error;
    }
    console.error(errorMessage, err);
    return throwError(() => new Error(errorMessage));
  }

  private resetForm() {
    this.selectedFiles = [];
    this.fileName = '';
    this.folderName = '';
    this.folderPathSegments = [];
    if (this.needsBackup === 'no') {
      this.localPath = '';
      this.backupTime = '';
      this.retentionDays = 7;
      this.backupFrequency = 'Daily';
      this.dayOfWeek = '';
      this.dayOfMonth = null;
    }
    this.overallProgress = 0;
    this.currentFileIndex = 0;
    this.uploadSessionId = null;
    this.fileNameError = '';
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}