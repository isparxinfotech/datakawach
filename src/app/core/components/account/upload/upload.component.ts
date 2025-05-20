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

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css']
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
  userFolders: string[] = [];
  retentionNeeded: number = 2;
  isLoading: boolean = true;
  isSchedulesLoading: boolean = false;
  isFetchingUserDetails: boolean = false;
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
    this.fetchUserDetails();
  }

  async fetchUserDetails() {
    this.isFetchingUserDetails = true;
    this.message = '';
    console.log('Fetching user details from backend...');

    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    console.log('AuthService userSessionDetails:', this.userSessionDetails);

    if (!this.userSessionDetails?.jwtToken || !this.userSessionDetails?.username) {
      const url = `https://datakavach.com/users/current`;
      try {
        const response = await this.http.get<userSessionDetails>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        console.log('Backend user details response:', response);
        this.userSessionDetails = response;
      } catch (err: any) {
        console.error('Error fetching user details:', err);
        let errorMessage = 'Failed to fetch user details';
        if (err.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        }
        this.handleError(new Error(errorMessage));
        this.userSessionDetails = null;
        this.isLoading = false;
        this.isFetchingUserDetails = false;
        this.cdr.detectChanges();
        return;
      }
    }

    if (this.userSessionDetails && this.userSessionDetails.jwtToken && this.userSessionDetails.username) {
      this.retentionNeeded = 2;
      console.log('Forcing retentionNeeded to:', this.retentionNeeded, 'for testing. Actual value from backend:', this.userSessionDetails.retentionNeeded);

      this.loadBackupSchedules();
      await this.loadUserFolders();
    } else {
      this.message = 'Invalid user session. Please log in again.';
      this.isSuccess = false;
      console.error('Invalid user session: Missing jwtToken or username');
    }

    this.isLoading = false;
    this.isFetchingUserDetails = false;
    this.cdr.detectChanges();
  }

  toggleRetentionNeeded() {
    this.retentionNeeded = this.retentionNeeded === 1 ? 2 : 1;
    console.log('Toggled retentionNeeded to:', this.retentionNeeded, 'for testing');
    this.message = '';
    this.backupSchedules = [];
    this.userFolders = [];
    this.files = [];
    this.nextLink = '';

    this.loadBackupSchedules();
    this.loadUserFolders();
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
    console.log('Files selected:', this.selectedFiles.map(file => file.name));

    if (this.selectedFiles.length > 0) {
      this.fileName = this.selectedFiles[0].name;
      this.validateFileNameInput();
    }
    this.cdr.detectChanges();
  }

  isScheduleFormValid(): boolean {
    if (this.retentionNeeded === 0) {
      return !!(
        this.userSessionDetails?.username &&
        this.folderName &&
        this.fileName &&
        this.selectedFiles.length > 0 &&
        !this.fileNameError
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

    if (this.retentionNeeded === 0) {
      await this.onUpload(this.fileName);
      this.scheduling = false;
      this.cdr.detectChanges();
      return;
    }

    const url = 'https://datakavach.com/onedrive/schedule';
    const body = new FormData();
    body.append('email', this.userSessionDetails!.username);
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
        await this.onUpload(this.fileName);
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
    body.append('email', this.userSessionDetails.username);

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
      console.log('Skipping loadBackupSchedules: No valid user');
      this.cdr.detectChanges();
      return;
    }

    this.isSchedulesLoading = true;
    this.message = '';
    const url = `https://datakavach.com/onedrive/schedules?email=${encodeURIComponent(this.userSessionDetails.username)}`;
    console.log('Fetching backup schedules from:', url);

    try {
      const schedules = await this.http.get<BackupSchedule[]>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.backupSchedules = schedules || [];
      console.log('Backup schedules loaded:', this.backupSchedules);
      if (this.backupSchedules.length === 0) {
        this.message = 'No backup schedules found for this user.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      console.error('Error loading backup schedules:', err);
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

  async loadUserFolders() {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
      this.userFolders = [];
      console.log('Skipping loadUserFolders: No valid user');
      this.cdr.detectChanges();
      return;
    }

    const url = `https://datakavach.com/onedrive/user-folders?email=${encodeURIComponent(this.userSessionDetails.username)}`;
    console.log('Fetching user folders from:', url);

    try {
      const response = await this.http.get<any>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      console.log('User folders response:', response);

      // Handle different response formats
      if (Array.isArray(response)) {
        this.userFolders = response;
      } else if (response && Array.isArray(response.folders)) {
        this.userFolders = response.folders;
      } else {
        throw new Error('Invalid response format for user folders');
      }

      console.log('User folders loaded:', this.userFolders);
      if (this.userFolders.length === 0) {
        this.message = 'No folders found for this user. Please create a folder in OneDrive.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      console.error('Error loading user folders:', err);
      let errorMessage = 'Failed to load user folders';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 500) {
        errorMessage = 'Server error while fetching folders. Please try again later.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      this.handleError(new Error(errorMessage));
      this.userFolders = [];
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
    let url = `https://datakavach.com/onedrive/files?email=${encodeURIComponent(this.userSessionDetails.username)}&folderName=${encodeURIComponent(this.folderName)}`;
    if (nextLink) {
      url = nextLink;
    }
    console.log('Fetching files from:', url);

    try {
      const response = await this.http.get<{ files: FileInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      console.log('Files response:', response);
      this.files = response?.files || [];
      this.nextLink = response?.nextLink || '';
      console.log('Files loaded:', this.files);
      if (this.files.length === 0) {
        this.message = 'No files found in the selected folder.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      console.error('Error loading files:', err);
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

  async onUpload(providedFileName?: string) {
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
      const rawFileName = providedFileName || file.name;
      const fileSize = file.size;
      const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);

      console.log(`Starting upload: ${rawFileName}, Size: ${fileSize} bytes, Total chunks: ${totalChunks}`);

      this.uploadSessionId = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
        const chunk = file.slice(startByte, endByte + 1);
        const chunkSize = endByte - startByte + 1;

        console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}, Bytes: ${startByte}-${endByte}, Size: ${chunkSize} bytes`);

        const formData = new FormData();
        formData.append('email', this.userSessionDetails!.username);
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
              console.warn(`Session expired, retrying chunk ${chunkIndex + 1}/${totalChunks} (Attempt ${retryCount + 1})`);
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
            console.log(`Chunk ${chunkIndex + 1} progress: ${this.chunkProgress}% | Overall: ${this.overallProgress}%`);
            this.cdr.detectChanges();
          } else if (event.type === HttpEventType.Response) {
            console.log('Chunk uploaded successfully:', event.body);
            resolve(event.body);
          }
        },
        error: (err) => {
          console.error('Chunk upload failed:', err);
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
    console.log('Success:', response);
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
    console.error('Error:', error);
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private resetForm() {
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