import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

interface ScheduledBackup {
  localPath: string;
  bucketName: string;
  folderPath: string;
  fileNames: string[];
  relativePaths: string[]; // Added to store relative paths for folder structure
  backupTime: string;
  retentionDays: number;
  backupFrequency: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
  intervalId?: any;
}

@Component({
  selector: 'app-upload-to-cloud',
  templateUrl: './upload-to-cloud.component.html',
  styleUrls: ['./upload-to-cloud.component.css'],
})
export class UploadToCloudComponent implements OnInit, OnDestroy {
  buckets: string[] = [];
  selectedBucket: string = '';
  folders: string[] = [];
  files: string[] = [];
  currentPath: string = '';
  userSessionDetails: userSessionDetails | null = null;
  filesToUpload: File[] = [];
  originalFiles: File[] = [];
  result: string = '';
  loading: boolean = false;
  uploadProgress: { [key: string]: number } = {};
  uploadDetails: { uploadTime: any; name: string; size: number; status: string }[] = [];
  logs: string[] = [];
  fileDownloadUrls: { [key: string]: string } = {};
  backupTime: string = '';
  retentionDays: number = 7;
  localPath: string = '';
  selectedItems: { name: string; type: 'file' | 'folder'; path: string; files?: { name: string; path: string; selected: boolean }[]; selected: boolean }[] = [];
  backupFrequency: string = 'Daily';
  dayOfWeek: string = 'Monday';
  dayOfMonth: number = 1;
  retentionEnabled: boolean = true;
  currentStep: number = 1;
  scheduledBackups: ScheduledBackup[] = [];
  totalStorage: number = 5 * 1024 * 1024; // 5TB in MB
  usedStorage: number = 0; // in GB
  usedStoragePercentage: number = 0;

  @ViewChild('logContainer') logContainer!: ElementRef;

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    try {
      this.userSessionDetails = this.authService.getLoggedInUserDetails();
      if (this.userSessionDetails?.username) {
        this.addLog(`Initializing component with user: ${this.userSessionDetails.username}`);
        this.loadBuckets();
        this.loadScheduledBackups();
        this.calculateUsedStorage();
      } else {
        this.result = 'User not logged in or email not available.';
        this.addLog('Error: User session details not available', true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.result = `Initialization error: ${errorMessage}`;
      this.addLog(`Initialization error: ${errorMessage}`, true);
      console.error('ngOnInit error:', error);
    }
  }

  ngOnDestroy() {
    this.scheduledBackups.forEach(backup => {
      if (backup.intervalId) clearInterval(backup.intervalId);
    });
    this.addLog('Component destroyed, cleared all scheduled backups');
  }

  addLog(message: string, isError: boolean = false) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${isError ? 'ERROR: ' : ''}${message}`;
    this.logs.push(logMessage);
    this.cdr.detectChanges();
    setTimeout(() => {
      if (this.logContainer?.nativeElement) {
        this.logContainer.nativeElement.scrollTop = this.logContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  clearLogs() {
    this.logs = [];
    this.addLog('Logs cleared');
  }

  resetForm() {
    this.filesToUpload = [];
    this.originalFiles = [];
    this.selectedItems = [];
    this.uploadProgress = {};
    this.uploadDetails = [];
    this.result = '';
    this.backupTime = '';
    this.retentionDays = 7;
    this.localPath = '';
    this.backupFrequency = 'Daily';
    this.dayOfWeek = 'Monday';
    this.dayOfMonth = 1;
    this.retentionEnabled = true;
    this.currentStep = 1;
    this.addLog('Form reset');
    this.cdr.detectChanges();
  }

  nextStep() {
    if (this.currentStep < 4) {
      this.currentStep++;
      this.addLog(`Moved to Step ${this.currentStep}`);
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.addLog(`Moved back to Step ${this.currentStep}`);
    }
  }

  loadBuckets() {
    if (!this.userSessionDetails?.username) {
      this.result = 'User email not available.';
      this.addLog('No email in userSessionDetails', true);
      return;
    }

    this.loading = true;
    this.addLog('Loading buckets...');
    const url = `https://datakavach.com/cloud/user-folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch buckets');
        return response.json();
      })
      .then((data: { folders: string[] }) => {
        this.buckets = data.folders;
        this.addLog(`Loaded ${this.buckets.length} buckets: ${this.buckets.join(', ')}`);
        if (this.buckets.length > 0 && !this.selectedBucket) {
          this.selectedBucket = this.buckets[0];
          this.loadFolders();
        }
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.result = `Failed to load buckets: ${errorMessage}`;
        this.addLog(`Error loading buckets: ${errorMessage}`, true);
        console.error('loadBuckets error:', error);
      })
      .finally(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  loadFolders() {
    if (!this.selectedBucket || !this.userSessionDetails?.username) {
      this.result = !this.selectedBucket ? 'No bucket selected.' : 'User email not available.';
      this.addLog('Missing required data for loadFolders', true);
      return;
    }

    this.loading = true;
    this.addLog(`Loading folders for bucket: ${this.selectedBucket}, path: ${this.currentPath || '/'}`);
    const url = `https://datakavach.com/cloud/folder-contents?username=${encodeURIComponent(this.userSessionDetails.username)}&folderPath=${encodeURIComponent(this.selectedBucket + (this.currentPath ? '/' + this.currentPath : ''))}`;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch folders: ${response.status} - ${errorText}`);
        }
        return response.json();
      })
      .then((data: { contents: { name: string; type: 'file' | 'folder'; path?: string }[] }) => {
        this.folders = data.contents.filter(item => item.type === 'folder').map(item => item.name);
        this.files = data.contents.filter(item => item.type === 'file').map(item => item.name);
        this.addLog(`Loaded ${this.folders.length} folders and ${this.files.length} files`);
        this.loadFileDownloadUrls();
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.result = errorMessage;
        this.addLog(`Error loading folders: ${errorMessage}`, true);
        console.error('loadFolders error:', error);
      })
      .finally(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  loadFileDownloadUrls() {
    if (!this.selectedBucket || !this.userSessionDetails?.username) return;

    const url = `https://datakavach.com/cloud/files?username=${encodeURIComponent(this.userSessionDetails.username)}&folderName=${encodeURIComponent(this.selectedBucket + (this.currentPath ? '/' + this.currentPath : ''))}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch file URLs');
        return response.json();
      })
      .then((data: { files: { name: string; downloadUrl: string }[] }) => {
        this.fileDownloadUrls = data.files.reduce((acc, file) => ({ ...acc, [file.name]: file.downloadUrl }), {});
        this.addLog(`Loaded download URLs for ${data.files.length} files`);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.addLog(`Error loading file URLs: ${errorMessage}`, true);
        console.error('loadFileDownloadUrls error:', error);
      });
  }

  getFileDownloadUrl(fileName: string): string {
    return this.fileDownloadUrls[fileName] || '#';
  }

  navigateToFolder(folder: string) {
    this.currentPath = this.currentPath ? `${this.currentPath}/${folder}` : folder;
    this.addLog(`Navigated to folder: ${this.currentPath}`);
    this.loadFolders();
  }

  goBack() {
    if (!this.currentPath) return;
    this.currentPath = this.currentPath.split('/').slice(0, -1).join('/');
    this.addLog(`Navigated back to: ${this.currentPath || '/'}`);
    this.loadFolders();
  }

  private findCommonRootFolder(): string {
    if (this.originalFiles.length === 0) return '';

    const paths = this.originalFiles.map(file => 
      (file as any).webkitRelativePath || file.name
    );
    
    if (paths.length === 1) {
      const pathParts = paths[0].split('/');
      return pathParts.length > 1 ? pathParts[0] : '';
    }

    const pathParts = paths.map(path => path.split('/'));
    const minLength = Math.min(...pathParts.map(parts => parts.length));
    let commonPrefix = '';

    for (let i = 0; i < minLength; i++) {
      const currentParts = pathParts.map(parts => parts[i]);
      if (new Set(currentParts).size === 1 && currentParts[0]) {
        commonPrefix = currentParts[0];
      } else {
        break;
      }
    }

    return commonPrefix;
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.filesToUpload = [];
    this.originalFiles = [];
    this.selectedItems = [];
    this.uploadProgress = {};

    if (input.files?.length) {
      this.originalFiles = Array.from(input.files);
      const folderMap = new Map<string, { name: string; path: string; selected: boolean }[]>();
      const rootFolder = this.findCommonRootFolder();

      this.originalFiles.forEach((file) => {
        let relativePath = (file as any).webkitRelativePath || file.name;
        // Adjust relative path to exclude root folder
        const adjustedPath = relativePath.startsWith(rootFolder) 
          ? relativePath.substring(rootFolder.length + 1)
          : relativePath;
        (file as any).adjustedRelativePath = adjustedPath || file.name;

        const pathParts = adjustedPath.split('/');
        const fileName = pathParts.pop()!;
        const folderPath = pathParts.join('/');

        if (folderPath) {
          if (!folderMap.has(folderPath)) {
            folderMap.set(folderPath, []);
          }
          folderMap.get(folderPath)!.push({ name: fileName, path: adjustedPath, selected: true });
          this.uploadProgress[adjustedPath] = 0;
        } else {
          this.selectedItems.push({ name: fileName, type: 'file', path: adjustedPath, selected: true });
          this.uploadProgress[adjustedPath] = 0;
        }
      });

      folderMap.forEach((files, folderPath) => {
        this.selectedItems.push({
          name: folderPath,
          type: 'folder',
          path: folderPath,
          files: files,
          selected: true
        });
      });

      this.updateFilesToUpload();
      this.calculateUsedStorage();
      this.addLog(`Selected ${this.originalFiles.length} files across ${folderMap.size} folders and ${this.selectedItems.filter(item => item.type === 'file').length} individual files`);
    } else {
      this.addLog('No files or folders selected', true);
    }
    this.cdr.detectChanges();
  }

  toggleItemSelection(item: { name: string; type: 'file' | 'folder'; path: string; files?: { name: string; path: string; selected: boolean }[]; selected: boolean }, event: Event) {
    item.selected = (event.target as HTMLInputElement).checked;
    if (item.type === 'folder' && item.files) {
      item.files.forEach(file => file.selected = item.selected);
    }
    this.updateFilesToUpload();
    this.calculateUsedStorage();
    this.cdr.detectChanges();
  }

  toggleFileSelection(item: { name: string; type: 'file' | 'folder'; path: string; files?: { name: string; path: string; selected: boolean }[]; selected: boolean }, file: { name: string; path: string; selected: boolean }, event: Event) {
    file.selected = (event.target as HTMLInputElement).checked;
    if (item.files) {
      item.selected = item.files.every(f => f.selected);
    }
    this.updateFilesToUpload();
    this.calculateUsedStorage();
    this.cdr.detectChanges();
  }

  updateFilesToUpload() {
    this.filesToUpload = [];
    this.selectedItems.forEach(item => {
      if (item.type === 'file' && item.selected) {
        const file = this.originalFiles.find(f => (f as any).adjustedRelativePath === item.path);
        if (file) this.filesToUpload.push(file);
      } else if (item.type === 'folder' && item.files) {
        item.files.forEach(file => {
          if (file.selected) {
            const originalFile = this.originalFiles.find(f => (f as any).adjustedRelativePath === file.path);
            if (originalFile) this.filesToUpload.push(originalFile);
          }
        });
      }
    });
  }

  validateLocalPath(path: string): boolean {
    const pathPattern = /^(\/|[a-zA-Z]:\\)[\w\-\\\/]+$/;
    return pathPattern.test(path);
  }

  validateBackupTime(time: string): boolean {
    const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timePattern.test(time);
  }

  async handleFileUpload() {
    if (this.filesToUpload.length === 0) {
      alert('Please select at least one file or folder to upload.');
      this.addLog('No files selected for upload', true);
      return;
    }

    if (!this.selectedBucket) {
      alert('Please select a bucket.');
      this.addLog('No bucket selected', true);
      return;
    }

    if (this.retentionEnabled) {
      if (!this.backupTime || !this.validateBackupTime(this.backupTime)) {
        alert('Please enter a valid backup time in HH:mm format (e.g., 14:30).');
        this.addLog(`Invalid or missing backup time: ${this.backupTime}`, true);
        return;
      }

      if (!this.retentionDays || this.retentionDays < 1) {
        alert('Please enter a valid retention period (minimum 1 day).');
        this.addLog(`Invalid retention days: ${this.retentionDays}`, true);
        return;
      }

      if (this.backupFrequency === 'Weekly' && !this.dayOfWeek) {
        alert('Please select a day of the week for weekly backups.');
        this.addLog('Day of week not selected for weekly backup', true);
        return;
      }

      if (this.backupFrequency === 'Monthly' && (!this.dayOfMonth || this.dayOfMonth < 1 || this.dayOfMonth > 31)) {
        alert('Please enter a valid day of the month (1-31) for monthly backups.');
        this.addLog(`Invalid day of month: ${this.dayOfMonth}`, true);
        return;
      }

      if (!this.localPath || !this.validateLocalPath(this.localPath)) {
        alert('Please enter a valid local file or folder path (e.g., /path/to/file or C:\\path\\to\\file).');
        this.addLog(`Invalid or missing local path: ${this.localPath}`, true);
        return;
      }
    }

    if (!this.userSessionDetails?.username) {
      alert('User email not available. Please log in.');
      this.addLog('User email not available', true);
      return;
    }

    this.loading = true;
    this.result = '';
    this.uploadDetails = [];
    this.addLog(`Upload started for ${this.filesToUpload.length} files to ${this.selectedBucket}/${this.currentPath || ''}`);

    const relativePaths = this.filesToUpload.map(file => (file as any).adjustedRelativePath || file.name);
    const formData = new FormData();
    this.filesToUpload.forEach(file => formData.append('files', file));
    formData.append('relativePaths', JSON.stringify(relativePaths));
    formData.append('username', this.userSessionDetails.username);
    formData.append('baseFolderName', this.selectedBucket + (this.currentPath ? '/' + this.currentPath : ''));

    try {
      const url = `https://datakavach.com/cloud/upload-folder`;
      this.addLog(`Uploading to: ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload folder: ${response.status} - ${errorText}`);
      }
      const result: { successMessages: string[]; errorMessages: string[] } = await response.json();

      this.uploadDetails = this.filesToUpload.map(file => {
        const relativePath = (file as any).adjustedRelativePath || file.name;
        const success = result.successMessages.find(msg => msg.includes(relativePath));
        return {
          name: relativePath,
          size: file.size,
          status: success ? 'uploaded' : 'failed',
          uploadTime: success ? new Date().toLocaleTimeString() : 'failed'
        };
      });

      const uploadedCount = this.uploadDetails.filter(d => d.status === 'uploaded').length;
      const failedCount = this.uploadDetails.filter(d => d.status === 'failed').length;
      this.result = `Processed ${this.uploadDetails.length} files:\n- Uploaded: ${uploadedCount}\n- Failed: ${failedCount}\n${result.errorMessages.join('\n')}`;
      this.addLog(`Upload complete: ${uploadedCount} uploaded, ${failedCount} failed`);
      this.loadFolders();
      this.calculateUsedStorage();

      if (this.retentionEnabled) {
        this.scheduleBackup(relativePaths);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.result = `Failed to upload files: ${errorMessage}`;
      this.uploadDetails = this.filesToUpload.map(file => ({
        name: (file as any).adjustedRelativePath || file.name,
        size: file.size,
        status: 'failed',
        uploadTime: 'failed'
      }));
      this.addLog(`Upload error: ${errorMessage}`, true);
      console.error('Upload error:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  scheduleBackup(relativePaths: string[]) {
    const fileNames = relativePaths.map(path => path.split('/').pop()!);
    const backup: ScheduledBackup = {
      localPath: this.localPath,
      bucketName: this.selectedBucket,
      folderPath: this.currentPath || '',
      fileNames,
      relativePaths, // Store relative paths for folder structure
      backupTime: this.backupTime,
      retentionDays: this.retentionDays,
      backupFrequency: this.backupFrequency,
      dayOfWeek: this.backupFrequency === 'Weekly' ? this.dayOfWeek : undefined,
      dayOfMonth: this.backupFrequency === 'Monthly' ? this.dayOfMonth : undefined,
    };

    this.scheduledBackups.push(backup);
    this.saveScheduledBackups();
    this.startBackupScheduler(backup);
    this.addLog(`Scheduled backup for ${fileNames.length} files: ${backup.backupFrequency} at ${backup.backupTime}`);
  }

  loadScheduledBackups() {
    const stored = localStorage.getItem('scheduledBackups');
    if (stored) {
      this.scheduledBackups = JSON.parse(stored);
      this.scheduledBackups.forEach(backup => this.startBackupScheduler(backup));
      this.addLog(`Loaded ${this.scheduledBackups.length} scheduled backups`);
    }
  }

  saveScheduledBackups() {
    localStorage.setItem('scheduledBackups', JSON.stringify(this.scheduledBackups.map(b => ({
      ...b,
      intervalId: undefined
    }))));
  }

  startBackupScheduler(backup: ScheduledBackup) {
    if (backup.intervalId) clearInterval(backup.intervalId);

    const checkBackup = async () => {
      const now = new Date();
      const [hours, minutes] = backup.backupTime.split(':').map(Number);
      const backupDate = new Date(now);
      backupDate.setHours(hours, minutes, 0, 0);

      let shouldRun = now.getHours() === hours && now.getMinutes() === minutes;
      if (shouldRun) {
        switch (backup.backupFrequency) {
          case 'Daily':
            break;
          case 'Weekly':
            shouldRun = now.toLocaleString('en-US', { weekday: 'long' }) === backup.dayOfWeek;
            break;
          case 'Monthly':
            shouldRun = now.getDate() === Math.min(backup.dayOfMonth!, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
            break;
        }
      }

      if (shouldRun) {
        await this.executeBackup(backup);
      }
    };

    backup.intervalId = setInterval(checkBackup, 60 * 1000);
  }

  async executeBackup(backup: ScheduledBackup) {
    this.addLog(`Executing scheduled backup for ${backup.fileNames.length} files to ${backup.bucketName}/${backup.folderPath}`);
    // Simulate fetching files from localPath (replace with actual file access if possible)
    const formData = new FormData();
    // For demo, assume files are re-selected or fetched from localPath
    // In practice, you'd need a backend service to access local files
    backup.relativePaths.forEach((path, index) => {
      const file = this.originalFiles.find(f => (f as any).adjustedRelativePath === path);
      if (file) {
        formData.append('files', file);
      }
    });
    formData.append('relativePaths', JSON.stringify(backup.relativePaths));
    formData.append('username', this.userSessionDetails!.username);
    formData.append('baseFolderName', backup.bucketName + (backup.folderPath ? '/' + backup.folderPath : ''));

    try {
      const response = await fetch(`https://datakavach.com/cloud/upload-folder`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Backup upload failed: ${response.statusText}`);
      }
      this.addLog(`Backup completed successfully for ${backup.fileNames.length} files`);
      // Report backup status
      await fetch(`https://datakavach.com/cloud/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: this.scheduledBackups.indexOf(backup) + 1, // Placeholder ID
          status: 'Completed',
          error: null
        })
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog(`Backup failed: ${errorMessage}`, true);
      await fetch(`https://datakavach.com/cloud/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: this.scheduledBackups.indexOf(backup) + 1,
          status: 'Failed',
          error: errorMessage
        })
      });
    }
  }

  async retryUpload(detail: { name: string; size: number; status: string }) {
    if (detail.status !== 'failed') {
      alert('Retry is only available for failed uploads.');
      this.addLog(`Cannot retry ${detail.name}: Status is ${detail.status}`, true);
      return;
    }

    const file = this.originalFiles.find(f => (f as any).adjustedRelativePath === detail.name);
    if (!file) {
      alert(`Please reselect ${detail.name} to retry the upload.`);
      this.addLog(`Cannot retry ${detail.name}: File not available`, true);
      return;
    }

    this.filesToUpload = [file];
    await this.handleFileUpload();
  }

  calculateUsedStorage() {
    let totalBytes = 0;
    this.uploadDetails.forEach(detail => {
      if (detail.status === 'uploaded') {
        totalBytes += detail.size;
      }
    });
    this.usedStorage = totalBytes / (1024 * 1024 * 1024); // Convert bytes to GB
    this.usedStoragePercentage = (this.usedStorage / (this.totalStorage / 1024)) * 100;
    this.cdr.detectChanges();
  }
}