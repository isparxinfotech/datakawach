import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Subscription } from 'rxjs';

// Interface for BackupSchedule to match backend BackupScheduleEntity
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

// Interface for File details from /onedrive/files endpoint
interface FileInfo {
  name: string;
  id: string;
  downloadUrl: string;
}

// Interface for Folder details from /onedrive/folders endpoint
interface FolderInfo {
  name: string;
  id: string;
  size: number;
}

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: []
})
export class UploadComponent implements OnInit, OnDestroy {
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
  chunkProgress: number = 0;
  currentFileIndex: number = 0;
  message: string = '';
  isSuccess: boolean = false;
  userSessionDetails: userSessionDetails | null | undefined = null;
  private readonly CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks
  private uploadSessionId: string | null = null;
  backupSchedules: BackupSchedule[] = [];
  rootFolders: FolderInfo[] = [];
  needsBackup: 'yes' | 'no' = 'yes';
  isLoading: boolean = true;
  isSchedulesLoading: boolean = false;
  isFilesLoading: boolean = false;
  files: FileInfo[] = [];
  nextLink: string = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.initializeUser();
  }

  async initializeUser() {
    this.message = '';
    this.userSessionDetails = this.authService.getLoggedInUserDetails();

    if (!this.userSessionDetails?.jwtToken || !this.userSessionDetails?.username) {
      const url = `https://datakavach.com/users/current`;
      try {
        const response = await this.http.get<userSessionDetails>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        this.userSessionDetails = response;
      } catch (err: any) {
        let errorMessage = 'Failed to fetch user details';
        if (err.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        }
        this.handleError(new Error(errorMessage));
        this.userSessionDetails = null;
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }
    }

    if (this.userSessionDetails && this.userSessionDetails.jwtToken && this.userSessionDetails.username) {
      this.loadBackupSchedules();
      await this.loadRootFolders();
    } else {
      this.message = 'Invalid user session. Please log in again.';
      this.isSuccess = false;
    }

    this.isLoading = false;
    this.cdr.detectChanges();
  }

  onBackupChoiceChange() {
    if (this.needsBackup === 'no') {
      // Reset scheduling fields when switching to "No Backup"
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
    this.chunkProgress = 0;
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

  async onCreateSchedule() {
    if (!this.isScheduleFormValid()) {
      this.message = 'Please fill all required fields correctly';
      this.isSuccess = false;
      this.cdr.detectChanges();
      return;
    }

    this.scheduling = true;
    this.message = '';

    if (this.needsBackup === 'no') {
      await this.onUpload();
      this.scheduling = false;
      this.cdr.detectChanges();
      return;
    }

    const url = 'https://datakavach.com/onedrive/schedule';
    const body = new FormData();
    body.append('username', this.userSessionDetails!.username);
    body.append('folderName', this.folderName);
    body.append('fileName', this.fileName);
    body.append('localPath', this.localPath);
    body.append('backupTime', this.backupTime + ':00');
    body.append('retentionDays', this.retentionDays.toString());
    body.append('backupFrequency', this.backupFrequency);
    if (this.dayOfWeek) body.append('dayOfWeek', this.dayOfWeek);
    if (this.dayOfMonth) body.append('dayOfMonth', this.dayOfMonth.toString());

    try {
      await this.http.post(url, body, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.message = 'Backup schedule created successfully';
      this.isSuccess = true;

      await this.loadBackupSchedules();

      if (this.selectedFiles.length > 0) {
        await this.onUpload();
      } else {
        this.handleSuccess('Backup schedule created without immediate upload');
      }
    } catch (err: any) {
      this.handleError(err);
    } finally {
      this.scheduling = false;
      this.cdr.detectChanges();
    }
  }

  async triggerManualBackup(scheduleId: number) {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
      this.cdr.detectChanges();
      return;
    }

    const url = 'https://datakavach.com/onedrive/backup-now';
    const body = new FormData();
    body.append('scheduleId', scheduleId.toString());
    body.append('username', this.userSessionDetails.username);

    try {
      await this.http.post(url, body, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.message = `Manual backup triggered for schedule ID: ${scheduleId}`;
      this.isSuccess = true;
      setTimeout(() => this.loadBackupSchedules(), 3000);
    } catch (err: any) {
      this.handleError(err);
    }
    this.cdr.detectChanges();
  }

  async loadBackupSchedules() {
    if (!this.userSessionDetails?.username) {
      this.backupSchedules = [];
      this.cdr.detectChanges();
      return;
    }

    this.isSchedulesLoading = true;
    this.message = '';
    const url = `https://datakavach.com/onedrive/schedules?username=${encodeURIComponent(this.userSessionDetails.username)}`;

    try {
      const response = await this.http.get<{ schedules: BackupSchedule[] }>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.backupSchedules = response?.schedules || [];
      if (this.backupSchedules.length === 0) {
        this.message = 'No backup schedules found for this user.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      let errorMessage = 'Failed to load backup schedules';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 404) {
        errorMessage = 'No schedules found for this user.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      this.handleError(new Error(errorMessage));
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

    const url = `https://datakavach.com/onedrive/folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;

    try {
      const response = await this.http.get<{ folders: FolderInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.rootFolders = response?.folders || [];
      if (this.rootFolders.length === 0) {
        this.message = 'No folders found in OneDrive. Please create a folder.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      let errorMessage = 'Failed to load root folders';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 500) {
        errorMessage = 'Server error while fetching folders. Please try again later.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      this.handleError(new Error(errorMessage));
      this.rootFolders = [];
    }
    this.cdr.detectChanges();
  }

  async loadFiles(nextLink?: string) {
    if (!this.userSessionDetails?.username || !this.folderName) {
      this.message = 'Please select a folder to list files';
      this.isSuccess = false;
      this.files = [];
      this.nextLink = '';
      this.cdr.detectChanges();
      return;
    }

    this.isFilesLoading = true;
    this.message = '';
    let url = `https://datakavach.com/onedrive/files?username=${encodeURIComponent(this.userSessionDetails.username)}&folderName=${encodeURIComponent(this.folderName)}`;
    if (nextLink) {
      url = nextLink;
    }

    try {
      const response = await this.http.get<{ files: FileInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.files = response?.files || [];
      this.nextLink = response?.nextLink || '';
      if (this.files.length === 0) {
        this.message = 'No files found in the selected folder.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      let errorMessage = 'Failed to load files';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 404) {
        errorMessage = 'Folder not found or no files available.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      this.handleError(new Error(errorMessage));
      this.files = [];
      this.nextLink = '';
    } finally {
      this.isFilesLoading = false;
      this.cdr.detectChanges();
    }
  }

  onFolderChange() {
    this.files = [];
    this.nextLink = '';
    this.loadFiles();
    this.cdr.detectChanges();
  }

  onFrequencyChange() {
    this.dayOfWeek = '';
    this.dayOfMonth = null;
    this.cdr.detectChanges();
  }

  async onUpload() {
    if (!this.userSessionDetails?.username || !this.folderName || this.selectedFiles.length === 0) {
      this.message = 'Please select a folder and at least one file for upload';
      this.isSuccess = false;
      this.uploading = false;
      this.cdr.detectChanges();
      return;
    }

    this.uploading = true;
    this.overallProgress = 0;
    this.chunkProgress = 0;
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
        formData.append('folderName', this.folderName);
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
            this.handleError(err);
            this.uploading = false;
            this.cdr.detectChanges();
            return;
          }
        }
      }
    }

    this.handleSuccess('All files uploaded successfully');
    this.loadFiles();
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
            this.chunkProgress = Math.round(100 * event.loaded / event.total);
            const currentFileUploaded = uploadedSize + event.loaded;
            this.overallProgress = Math.round((currentFileUploaded / totalSize) * 100);
            this.cdr.detectChanges();
          } else if (event.type === HttpEventType.Response) {
            resolve(event.body);
          }
        },
        error: (err) => {
          reject(err);
        }
      });
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  private handleSuccess(response: any) {
    this.uploading = false;
    this.scheduling = false;
    this.isSuccess = true;
    this.message = typeof response === 'string' ? response : 'Operation completed successfully!';
    this.resetForm();
    this.cdr.detectChanges();
  }

  private handleError(error: any) {
    this.uploading = false;
    this.scheduling = false;
    this.isSuccess = false;
    let errorMessage = 'An error occurred';
    if (error.error && error.error.message) {
      errorMessage = error.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    this.message = errorMessage;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private resetForm() {
    this.needsBackup = 'yes';
    this.selectedFiles = [];
    this.fileName = '';
    this.localPath = '';
    this.backupTime = '';
    this.retentionDays = 7;
    this.backupFrequency = 'Daily';
    this.dayOfWeek = '';
    this.dayOfMonth = null;
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.currentFileIndex = 0;
    this.uploadSessionId = null;
    this.fileNameError = '';
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}