import { Component, OnInit, OnDestroy } from '@angular/core';
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

// Interface for OneDrive folder
interface OneDriveFolder {
  name: string;
  id: string;
  size: number;
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
  userSessionDetails: userSessionDetails | null = null;
  private readonly CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks
  private uploadSessionId: string | null = null;
  backupSchedules: BackupSchedule[] = [];
  oneDriveFolders: OneDriveFolder[] = [];
  retentionNeeded: number = 0; // Default, will be updated from userSessionDetails
  isLoading: boolean = true;
  private subscriptions: Subscription[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails() || {
      statusCode: '200',
      jwtToken: '',
      username: 'JohnDoe@example.com',
      resourcePermission: [],
      userType: 0,
      roleid: 0,
      cloudProvider: undefined,
      retentionNeeded: 0
    };
    console.log('userSessionDetails:', this.userSessionDetails);

    if (this.userSessionDetails && this.userSessionDetails.jwtToken) {
      this.retentionNeeded = this.userSessionDetails.retentionNeeded ?? 0;
      console.log('Retention Needed:', this.retentionNeeded);

      this.loadOneDriveFolders();
      if (this.retentionNeeded === 1 || this.retentionNeeded === 2) {
        this.loadBackupSchedules();
      }

      this.isLoading = false;
    } else {
      this.isLoading = false;
      this.message = 'No valid user session or JWT token found';
      this.isSuccess = false;
    }
  }

  validateFileNameInput(): void {
    // Optional: Add validation for other invalid characters if needed
    // For now, no restrictions on spaces
    this.fileNameError = '';
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
    }
  }

  isScheduleFormValid(): boolean {
    if (this.retentionNeeded === 0) {
      return !!(
        this.userSessionDetails?.username &&
        this.folderName &&
        this.fileName &&
        this.selectedFiles.length > 0
      );
    }
    return !!(
      this.userSessionDetails?.username &&
      this.folderName &&
      this.fileName &&
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
      return;
    }

    this.scheduling = true;
    this.message = '';

    if (this.retentionNeeded === 0) {
      await this.onUpload(this.fileName);
      this.scheduling = false;
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
    }
  }

  async triggerManualBackup(scheduleId: number) {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
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
  }

  async loadBackupSchedules() {
    if (!this.userSessionDetails?.username || (this.retentionNeeded !== 1 && this.retentionNeeded !== 2)) {
      this.backupSchedules = [];
      return;
    }

    const url = `https://datakavach.com/onedrive/schedules?email=${encodeURIComponent(this.userSessionDetails.username)}`;
    try {
      const schedules = await this.http.get<BackupSchedule[]>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.backupSchedules = schedules || [];
      console.log('Backup schedules loaded:', this.backupSchedules);
    } catch (err: any) {
      this.handleError(err);
    }
  }

  async loadOneDriveFolders() {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
      return;
    }

    const url = `https://datakavach.com/onedrive/folders?email=${encodeURIComponent(this.userSessionDetails.username)}`;
    try {
      const folders = await this.http.get<OneDriveFolder[]>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.oneDriveFolders = folders || [];
      console.log('OneDrive folders loaded:', this.oneDriveFolders);
    } catch (err: any) {
      this.handleError(err);
    }
  }

  onFrequencyChange() {
    this.dayOfWeek = '';
    this.dayOfMonth = null;
  }

  async onUpload(providedFileName?: string) {
    if (!this.userSessionDetails?.username || !this.folderName || this.selectedFiles.length === 0) {
      this.message = 'Please provide a folder name and select at least one file for upload';
      this.isSuccess = false;
      this.uploading = false;
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

      this.uploadSessionId = null; // Reset session ID for each file

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
            return;
          }
        }
      }
    }

    this.handleSuccess('All files uploaded successfully');
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
  }

  private resetForm() {
    this.selectedFiles = [];
    this.folderName = '';
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
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}