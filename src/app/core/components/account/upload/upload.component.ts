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

// Interface for File/Folder details from /onedrive/folder-contents endpoint
interface ContentInfo {
  name: string;
  id: string;
  size: number;
  type: 'file' | 'folder';
  downloadUrl?: string;
}

// Interface for Folder details from /onedrive/folders, /onedrive/user-folders, or /onedrive/customer-folder endpoint
interface FolderInfo {
  name: string;
  id?: string;
  size?: number;
}

interface UserFoldersResponse {
  folders: string[];
}

interface CustomerFolderResponse {
  folder: string;
}

// Interface for file with relative path
interface FileWithPath {
  file: File;
  relativePath: string;
}

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: []
})
export class UploadComponent implements OnInit, OnDestroy {
  folderName: string = '';
  selectedRootFolder: string = '';
  folderPath: string = '';
  folderPathSegments: string[] = [];
  folderContents: ContentInfo[] = [];
  fileName: string = '';
  fileNameError: string = '';
  localPath: string = '';
  backupTime: string = '';
  retentionDays: number = 7;
  backupFrequency: string = 'Daily';
  dayOfWeek: string = '';
  dayOfMonth: number | null = null;
  selectedFiles: FileWithPath[] = [];
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
  uploadType: 'file' | 'folder' = 'file';
  isLoading: boolean = true;
  isSchedulesLoading: boolean = false;
  isFolderContentsLoading: boolean = false;
  nextLink: string = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  // Getter to check if userType is '8'
  get isCustomerUserType(): boolean {
    return String(this.userSessionDetails?.userType) === '8';
  }

  ngOnInit(): void {
    this.isLoading = true;
    this.initializeUser();
  }

  async initializeUser() {
    this.message = '';
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    console.log('userSessionDetails:', this.userSessionDetails);

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

  onUploadTypeChange() {
    this.selectedFiles = [];
    this.fileName = '';
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.currentFileIndex = 0;
    this.uploadSessionId = null;
    this.message = '';
    this.cdr.detectChanges();
  }

  validateFileNameInput(): void {
    this.fileNameError = '';
    if (!this.fileName && this.uploadType === 'file') {
      this.fileNameError = 'File name is required';
    } else if (/[<>:\"\/\\|?*\x00-\x1F]/.test(this.fileName)) {
      this.fileNameError = this.uploadType === 'file' ? 'File name contains invalid characters' : 'Folder name contains invalid characters';
    } else if (this.fileName.length > 255) {
      this.fileNameError = 'Name exceeds 255 characters';
    }
    this.cdr.detectChanges();
  }

  onFilesSelected(event: any) {
    this.selectedFiles = [];
    this.message = '';
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.currentFileIndex = 0;
    this.uploadSessionId = null;

    const files: File[] = Array.from(event.target.files);
    let topLevelFolder = '';

    for (const file of files) {
      let relativePath = '';
      if (this.uploadType === 'folder' && file.webkitRelativePath) {
        // Get the full webkitRelativePath
        relativePath = file.webkitRelativePath.replace(/\\/g, '/').trim();
        // Determine the top-level folder (first segment of relativePath)
        if (!topLevelFolder) {
          topLevelFolder = relativePath.split('/')[0];
        }
        // Remove the top-level folder from relativePath, keeping subfolder structure
        relativePath = relativePath.startsWith(topLevelFolder + '/')
          ? relativePath.substring(topLevelFolder.length + 1)
          : relativePath;
      } else if (this.uploadType === 'file') {
        relativePath = file.name;
      }
      this.selectedFiles.push({ file, relativePath });
    }

    if (this.selectedFiles.length > 0) {
      this.fileName = this.uploadType === 'file' ? this.selectedFiles[0].file.name : topLevelFolder;
      this.validateFileNameInput();
    }
    console.log('Selected files:', this.selectedFiles.map(item => item.relativePath));
    this.cdr.detectChanges();
  }

  isScheduleFormValid(): boolean {
    if (this.needsBackup === 'no') {
      return !!(
        this.userSessionDetails?.username &&
        this.folderPath && this.folderPath.trim() !== '' &&
        (this.uploadType === 'folder' || (this.fileName && !this.fileNameError)) &&
        this.selectedFiles.length > 0
      );
    }
    return !!(
      this.userSessionDetails?.username &&
      this.folderPath && this.folderPath.trim() !== '' &&
      (this.uploadType === 'folder' || (this.fileName && !this.fileNameError)) &&
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

    const url = 'https://datakavach.com/isparxcloud/schedule';
    const body = new FormData();
    body.append('username', this.userSessionDetails!.username);
    body.append('folderName', this.folderPath);
    const defaultFolderName = this.folderPath.split('/').pop() || 'defaultFolder';
    body.append('fileName', this.fileName || (this.uploadType === 'folder' ? defaultFolderName : ''));
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

    const url = 'https://datakavach.com/isparxcloud/trigger-backup';
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
    const url = `https://datakavach.com/isparxcloud/schedules?username=${encodeURIComponent(this.userSessionDetails.username)}`;

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

    let url: string;
    const userType = this.userSessionDetails.userType;
    const isRetentionNeeded = this.userSessionDetails.retentionNeeded === 1;

    // Determine the endpoint based on userType and retentionNeeded
    if (userType !== undefined && String(userType) === '8') {
      url = `https://datakavach.com/isparxcloud/customer-folder?username=${encodeURIComponent(this.userSessionDetails.username)}`;
    } else if (isRetentionNeeded) {
      url = `https://datakavach.com/isparxcloud/user-folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;
    } else {
      url = `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;
    }

    try {
      if (userType !== undefined && String(userType) === '8') {
        // Handle customer-folder response: { folder: string }
        const response = await this.http.get<CustomerFolderResponse>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        if (!response || typeof response !== 'object' || !response.folder) {
          throw new Error('Invalid response format: Expected { folder: string }');
        }
        this.rootFolders = [{
          name: response.folder || 'Unknown Folder',
          id: '',
          size: 0
        }];
        this.nextLink = '';
        // Auto-select the single folder for userType === '8'
        this.selectedRootFolder = this.rootFolders[0].name;
        this.onRootFolderChange();
      } else if (isRetentionNeeded) {
        // Handle user-folders response: { folders: string[] }
        const response = await this.http.get<UserFoldersResponse>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        this.rootFolders = response?.folders.map(name => ({ name, id: '', size: 0 })) || [];
        this.nextLink = '';
      } else {
        // Handle folders response: { folders: FolderInfo[], nextLink: string }
        const response = await this.http.get<{ folders: FolderInfo[], nextLink: string }>(url, {
          headers: this.getAuthHeaders()
        }).toPromise();
        this.rootFolders = response?.folders || [];
        this.nextLink = response?.nextLink || '';
      }

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
      } else if (err.status === 404) {
        errorMessage = 'No folders found for this user.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      this.handleError(new Error(errorMessage));
      this.rootFolders = [];
      this.nextLink = '';
    }
    this.cdr.detectChanges();
  }

  async loadFolderContents(folderPath: string, nextLink?: string) {
    if (!this.userSessionDetails?.username) {
      this.message = 'No user logged in';
      this.isSuccess = false;
      this.folderContents = [];
      this.nextLink = '';
      this.cdr.detectChanges();
      return;
    }

    const userType = this.userSessionDetails.userType;
    this.isFolderContentsLoading = true;
    this.message = '';

    if (userType !== undefined && String(userType) === '8') {
      // For userType === '8', customer-folder does not support subfolder navigation
      // Set folderContents to empty as we can't fetch subfolder contents
      this.folderContents = [];
      this.nextLink = '';
      this.message = 'Subfolder navigation is not available for this user type.';
      this.isSuccess = false;
      this.isFolderContentsLoading = false;
      this.cdr.detectChanges();
      return;
    }

    let url = `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.userSessionDetails.username)}&folderPath=${encodeURIComponent(folderPath)}`;
    if (nextLink) {
      url = nextLink;
    }

    try {
      const response = await this.http.get<{ contents: ContentInfo[], nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      }).toPromise();
      this.folderContents = response?.contents || [];
      this.nextLink = response?.nextLink || '';
      if (this.folderContents.length === 0) {
        this.message = 'No contents found in the selected folder.';
        this.isSuccess = false;
      }
    } catch (err: any) {
      let errorMessage = 'Failed to load folder contents';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 404) {
        errorMessage = 'Folder not found.';
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      this.handleError(new Error(errorMessage));
      this.folderContents = [];
      this.nextLink = '';
    } finally {
      this.isFolderContentsLoading = false;
      this.cdr.detectChanges();
    }
  }

  onRootFolderChange() {
    this.folderPath = this.selectedRootFolder;
    this.folderPathSegments = this.folderPath ? this.folderPath.split('/') : [];
    this.folderName = this.folderPath;
    this.loadFolderContents(this.folderPath);
    this.cdr.detectChanges();
  }

  selectSubFolder(subFolderName: string) {
    this.folderPath = this.folderPath ? `${this.folderPath}/${subFolderName}` : subFolderName;
    this.folderPathSegments = this.folderPath.split('/');
    this.folderName = this.folderPath;
    this.loadFolderContents(this.folderPath);
    this.cdr.detectChanges();
  }

  navigateToFolder(path: string) {
    this.folderPath = path;
    this.folderPathSegments = path ? path.split('/') : [];
    this.folderName = this.folderPath;
    this.loadFolderContents(this.folderPath);
    this.cdr.detectChanges();
  }

  getPathUpToIndex(index: number): string {
    return this.folderPathSegments.slice(0, index + 1).join('/');
  }

  onFrequencyChange() {
    this.dayOfWeek = '';
    this.dayOfMonth = null;
    this.cdr.detectChanges();
  }

  async onUpload() {
    if (!this.userSessionDetails?.username || !this.folderPath || this.selectedFiles.length === 0) {
      this.message = 'Please select a folder and at least one file or folder for upload';
      this.isSuccess = false;
      this.uploading = false;
      this.cdr.detectChanges();
      return;
    }

    // Ensure folderPath is a valid string
    const normalizedFolderPath = this.folderPath.replace(/^\/+|\/+$/g, '') || 'root';
    if (!normalizedFolderPath) {
      this.message = 'Selected folder path is invalid';
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

    if (this.uploadType === 'file') {
      // Upload multiple files individually
      const totalSize = this.selectedFiles.reduce((sum, item) => sum + item.file.size, 0);
      let uploadedSize = 0;

      for (let i = 0; i < this.selectedFiles.length; i++) {
        this.currentFileIndex = i;
        const { file, relativePath } = this.selectedFiles[i];
        const rawFileName = this.fileName || file.name;
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
          formData.append('folderName', normalizedFolderPath);
          formData.append('file', chunk, rawFileName);
          formData.append('chunkIndex', chunkIndex.toString());
          formData.append('totalChunks', totalChunks.toString());
          formData.append('startByte', startByte.toString());
          formData.append('endByte', endByte.toString());
          formData.append('totalSize', fileSize.toString());
          if (this.uploadSessionId) {
            formData.append('sessionId', this.uploadSessionId);
          }
          if (relativePath) {
            formData.append('relativePath', relativePath);
          }

          const url = `https://datakavach.com/isparxcloud/upload/${encodeURIComponent(rawFileName)}`;

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
    } else {
      // Upload folder with directory structure
      const url = 'https://datakavach.com/isparxcloud/upload-folder';
      const formData = new FormData();
      formData.append('email', this.userSessionDetails!.username);
      // Use fileName (set to topLevelFolder) or fallback to a default
      const topLevelFolder = this.fileName || 'uploaded_folder';
      const finalFolderPath = normalizedFolderPath ? `${normalizedFolderPath}/${topLevelFolder}` : topLevelFolder;
      formData.append('baseFolderName', finalFolderPath);

      console.log('Uploading folder with:');
      console.log('baseFolderName:', finalFolderPath);
      console.log('files count:', this.selectedFiles.length);
      console.log('relativePaths:', this.selectedFiles.map(item => item.relativePath));

      this.selectedFiles.forEach((item) => {
        formData.append('files', item.file);
        if (item.relativePath) {
          formData.append('relativePaths', item.relativePath);
        }
      });

      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const response = await new Promise<any>((resolve, reject) => {
            this.http.post(url, formData, {
              headers: this.getAuthHeaders(),
              reportProgress: true,
              observe: 'events'
            }).subscribe({
              next: (event: any) => {
                if (event.type === HttpEventType.UploadProgress && event.total) {
                  this.overallProgress = Math.round(100 * event.loaded / event.total);
                  this.cdr.detectChanges();
                } else if (event.type === HttpEventType.Response) {
                  console.log('Upload response:', event.body);
                  resolve(event.body);
                }
              },
              error: (err) => {
                console.error('Upload error:', err);
                reject(err);
              }
            });
          });
          // Process backend response
          const successMessages = response.successMessages || [];
          const errorMessages = response.errorMessages || [];
          if (errorMessages.length > 0) {
            this.handleError(new Error(errorMessages.join('; ')));
          } else {
            this.handleSuccess(`Folder uploaded successfully: ${successMessages.join('; ')}`);
          }
          break;
        } catch (err: any) {
          if (err.status === 400 && err.error?.message.includes('session expired') && retryCount < maxRetries) {
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

    this.loadFolderContents(this.folderPath);
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
    const modal = new (window as any).bootstrap.Modal(document.getElementById('successModal'));
    modal.show();
    const currentNeedsBackup = this.needsBackup;
    this.resetForm();
    this.needsBackup = currentNeedsBackup;
    this.cdr.detectChanges();
  }

  private handleError(error: any) {
    console.error('Error details:', error);
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
    this.uploadType = 'file';
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}