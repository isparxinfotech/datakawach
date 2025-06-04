import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

interface ScheduledBackup {
  localPath: string;
  bucketName: string;
  folderPath: string;
  fileNames: string[];
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
  uploadDetails: {
    uploadTime: any;
    name: string;
    size: number;
    status: string;
  }[] = [];
  logs: string[] = [];
  fileDownloadUrls: { [key: string]: string } = {};
  backupTime: string = '';
  retentionDays: number = 7;
  localPath: string = '';
  selectedItems: {
    name: string;
    type: 'file' | 'folder';
    path: string;
    files?: { name: string; path: string; selected: boolean }[];
    selected: boolean;
  }[] = [];
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
        this.addLog(
          `Initializing component with user: ${this.userSessionDetails.username}`
        );
        this.loadBuckets();
        this.loadScheduledBackups();
        this.calculateUsedStorage();
      } else {
        this.result = 'User not logged in or email not available.';
        this.addLog('Error: User session details not available', true);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.result = `Initialization error: ${errorMessage}`;
      this.addLog(`Initialization error: ${errorMessage}`, true);
      console.error('ngOnInit error:', error);
    }
  }

  ngOnDestroy() {
    this.scheduledBackups.forEach((backup) => {
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
        this.logContainer.nativeElement.scrollTop =
          this.logContainer.nativeElement.scrollHeight;
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
    const url = `http://13.203.227.138/api/s3/buckets?email=${encodeURIComponent(
      this.userSessionDetails.username
    )}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch buckets');
        return response.json();
      })
      .then((data: string[]) => {
        this.buckets = data;
        this.addLog(
          `Loaded ${this.buckets.length} buckets: ${this.buckets.join(', ')}`
        );
        if (this.buckets.length > 0 && !this.selectedBucket) {
          this.selectedBucket = this.buckets[0];
          this.loadFolders();
        }
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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
      this.result = !this.selectedBucket
        ? 'No bucket selected.'
        : 'User email not available.';
      this.addLog('Missing required data for loadFolders', true);
      return;
    }

    this.loading = true;
    this.addLog(
      `Loading folders for bucket: ${this.selectedBucket}, path: ${
        this.currentPath || '/'
      }`
    );
    const url = `http://13.203.227.138/api/s3/folders?email=${encodeURIComponent(
      this.userSessionDetails.username
    )}&bucketName=${encodeURIComponent(this.selectedBucket)}${
      this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''
    }`;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to fetch folders: ${response.status} - ${errorText}`
          );
        }
        return response.json();
      })
      .then((data: { folders: string[]; files: string[] }) => {
        this.folders = data.folders;
        this.files = data.files;
        this.addLog(
          `Loaded ${this.folders.length} folders and ${this.files.length} files`
        );
        this.loadFileDownloadUrls();
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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

    const url = `http://13.203.227.138/api/s3/files?email=${encodeURIComponent(
      this.userSessionDetails.username
    )}&bucketName=${encodeURIComponent(this.selectedBucket)}${
      this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''
    }`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch file URLs');
        return response.json();
      })
      .then((data: { fileName: string; downloadUrl: string }[]) => {
        this.fileDownloadUrls = data.reduce(
          (acc, file) => ({ ...acc, [file.fileName]: file.downloadUrl }),
          {}
        );
        this.addLog(`Loaded download URLs for ${data.length} files`);
      })
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.addLog(`Error loading file URLs: ${errorMessage}`, true);
        console.error('loadFileDownloadUrls error:', error);
      });
  }

  getFileDownloadUrl(fileName: string): string {
    return this.fileDownloadUrls[fileName] || '#';
  }

  navigateToFolder(folder: string) {
    this.currentPath = this.currentPath
      ? `${this.currentPath}/${folder}`
      : folder;
    this.addLog(`Navigated to folder: ${this.currentPath}`);
    this.loadFolders();
  }

  goBack() {
    if (!this.currentPath) return;
    this.currentPath = this.currentPath.split('/').slice(0, -1).join('/');
    this.addLog(`Navigated back to: ${this.currentPath || '/'}`);
    this.loadFolders();
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.filesToUpload = [];
    this.originalFiles = [];
    this.selectedItems = [];
    this.uploadProgress = {};

    if (input.files?.length) {
      this.originalFiles = Array.from(input.files);
      const folderMap = new Map<
        string,
        { name: string; path: string; selected: boolean }[]
      >();

      this.originalFiles.forEach((file) => {
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split('/');
        const fileName = pathParts.pop()!;
        const folderPath = pathParts.join('/');

        if (folderPath) {
          if (!folderMap.has(folderPath)) {
            folderMap.set(folderPath, []);
          }
          folderMap
            .get(folderPath)!
            .push({ name: fileName, path: relativePath, selected: true });
          this.uploadProgress[relativePath] = 0;
        } else {
          this.selectedItems.push({
            name: fileName,
            type: 'file',
            path: relativePath,
            selected: true,
          });
          this.uploadProgress[relativePath] = 0;
        }
      });

      folderMap.forEach((files, folderPath) => {
        this.selectedItems.push({
          name: folderPath,
          type: 'folder',
          path: folderPath,
          files: files,
          selected: true,
        });
      });

      this.updateFilesToUpload();
      this.calculateUsedStorage();
      this.addLog(
        `Selected ${this.originalFiles.length} files across ${
          folderMap.size
        } folders and ${
          this.selectedItems.filter((item) => item.type === 'file').length
        } individual files`
      );
    } else {
      this.addLog('No files or folders selected', true);
    }
    this.cdr.detectChanges();
  }

  toggleItemSelection(
    item: {
      name: string;
      type: 'file' | 'folder';
      path: string;
      files?: { name: string; path: string; selected: boolean }[];
      selected: boolean;
    },
    event: Event
  ) {
    item.selected = (event.target as HTMLInputElement).checked;
    if (item.type === 'folder' && item.files) {
      item.files.forEach((file) => (file.selected = item.selected));
    }
    this.updateFilesToUpload();
    this.calculateUsedStorage();
    this.cdr.detectChanges();
  }

  toggleFileSelection(
    item: {
      name: string;
      type: 'file' | 'folder';
      path: string;
      files?: { name: string; path: string; selected: boolean }[];
      selected: boolean;
    },
    file: { name: string; path: string; selected: boolean },
    event: Event
  ) {
    file.selected = (event.target as HTMLInputElement).checked;
    if (item.files) {
      item.selected = item.files.every((f) => f.selected);
    }
    this.updateFilesToUpload();
    this.calculateUsedStorage();
    this.cdr.detectChanges();
  }

  updateFilesToUpload() {
    this.filesToUpload = [];
    this.selectedItems.forEach((item) => {
      if (item.type === 'file' && item.selected) {
        const file = this.originalFiles.find(
          (f) =>
            (f as any).webkitRelativePath === item.path || f.name === item.path
        );
        if (file) this.filesToUpload.push(file);
      } else if (item.type === 'folder' && item.files) {
        item.files.forEach((file) => {
          if (file.selected) {
            const originalFile = this.originalFiles.find(
              (f) => (f as any).webkitRelativePath === file.path
            );
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
        alert(
          'Please enter a valid backup time in HH:mm format (e.g., 14:30).'
        );
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

      if (
        this.backupFrequency === 'Monthly' &&
        (!this.dayOfMonth || this.dayOfMonth < 1 || this.dayOfMonth > 31)
      ) {
        alert(
          'Please enter a valid day of the month (1-31) for monthly backups.'
        );
        this.addLog(`Invalid day of month: ${this.dayOfMonth}`, true);
        return;
      }

      if (!this.localPath || !this.validateLocalPath(this.localPath)) {
        alert(
          'Please enter a valid local file or folder path (e.g., /path/to/file or C:\\path\\to\\file).'
        );
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
    this.addLog(
      `Upload started for ${this.filesToUpload.length} files to ${
        this.selectedBucket
      }/${this.currentPath || ''}`
    );

    const fileNames = this.filesToUpload.map(
      (file) => (file as any).webkitRelativePath || file.name
    );
    const fileSizes = this.filesToUpload.map((file) => file.size.toString());
    const url = `http://13.203.227.138/api/s3/generate-presigned-urls?email=${encodeURIComponent(
      this.userSessionDetails.username
    )}&bucketName=${encodeURIComponent(
      this.selectedBucket
    )}&fileNames=${encodeURIComponent(
      fileNames.join(',')
    )}&fileSizes=${encodeURIComponent(fileSizes.join(','))}${
      this.currentPath
        ? '&folderPath=' + encodeURIComponent(this.currentPath)
        : ''
    }`;

    try {
      this.addLog(`Requesting presigned URLs: ${url}`);
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to generate presigned URLs: ${response.status} - ${errorText}`
        );
      }
      const presignedData: {
        fileName: string;
        s3Key: string;
        url?: string;
        uploadId?: string;
        parts?: {
          partNumber: number;
          url: string;
          startByte: number;
          endByte: number;
        }[];
      }[] = await response.json();

      await Promise.all(
        this.filesToUpload.map(async (file) => {
          const relativePath = (file as any).webkitRelativePath || file.name;
          const fileData = presignedData.find(
            (d) => d.fileName === relativePath
          );
          if (!fileData)
            throw new Error(`No presigned data for ${relativePath}`);

          this.uploadProgress[relativePath] = 0;
          this.uploadDetails.push({
            name: relativePath,
            size: file.size,
            status: 'uploading',
            uploadTime: undefined,
          });

          if (fileData.url) {
            await this.uploadSinglePart(file, fileData.url, relativePath);
          } else if (fileData.uploadId && fileData.parts) {
            const uploadedParts = await this.uploadMultipart(
              file,
              fileData.parts,
              relativePath
            );
            await this.completeMultipartUpload(
              fileData.s3Key,
              fileData.uploadId,
              uploadedParts,
              relativePath
            );
          } else {
            throw new Error(`Invalid presigned data for ${relativePath}`);
          }
        })
      );

      const uploadedCount = this.uploadDetails.filter(
        (d) => d.status === 'uploaded'
      ).length;
      const failedCount = this.uploadDetails.filter(
        (d) => d.status === 'failed'
      ).length;
      this.result = `Processed ${this.uploadDetails.length} files:\n- Uploaded: ${uploadedCount}\n- Failed: ${failedCount}`;
      this.addLog(
        `Upload complete: ${uploadedCount} uploaded, ${failedCount} failed`
      );
      this.loadFolders();
      this.calculateUsedStorage();

      if (this.retentionEnabled) {
        this.scheduleBackup(fileNames);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.result = `Failed to upload files: ${errorMessage}`;
      this.addLog(`Upload error: ${errorMessage}`, true);
      console.error('Upload error:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async uploadSinglePart(file: File, url: string, relativePath: string) {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        this.uploadProgress[relativePath] = progress;
        this.cdr.detectChanges();
      }
    };
    return new Promise<void>((resolve, reject) => {
      xhr.onload = () => {
        const index = this.uploadDetails.findIndex(
          (d) => d.name === relativePath
        );
        if (xhr.status === 200) {
          this.uploadDetails[index].status = 'uploaded';
          this.addLog(`Upload completed for ${relativePath}`);
          resolve();
        } else {
          this.uploadDetails[index].status = 'failed';
          this.addLog(
            `Upload failed for ${relativePath}: ${xhr.statusText}`,
            true
          );
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
        this.cdr.detectChanges();
      };
      xhr.onerror = () => {
        const index = this.uploadDetails.findIndex(
          (d) => d.name === relativePath
        );
        this.uploadDetails[index].status = 'failed';
        this.addLog(`Upload error for ${relativePath}`, true);
        reject(new Error('Upload error'));
        this.cdr.detectChanges();
      };
      xhr.send(file);
    });
  }

  async uploadMultipart(
    file: File,
    parts: {
      partNumber: number;
      url: string;
      startByte: number;
      endByte: number;
    }[],
    relativePath: string
  ): Promise<{ PartNumber: number; ETag: string }[]> {
    const uploadedParts: { PartNumber: number; ETag: string }[] = [];
    let totalUploaded = 0;
    const totalSize = file.size;

    for (const part of parts) {
      const blob = file.slice(part.startByte, part.endByte + 1);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', part.url, true);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          totalUploaded =
            totalUploaded -
            (this.uploadProgress[relativePath] * totalSize) / 100 +
            (event.loaded / totalSize) * 100;
          this.uploadProgress[relativePath] = Math.round(
            totalUploaded / parts.length
          );
          this.cdr.detectChanges();
        }
      };
      const response = await new Promise<{ PartNumber: number; ETag: string }>(
        (resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status === 200) {
              const eTag = xhr.getResponseHeader('ETag')?.replace(/"/g, '');
              if (eTag) {
                resolve({ PartNumber: part.partNumber, ETag: eTag });
              } else {
                reject(new Error(`No ETag for part ${part.partNumber}`));
              }
            } else {
              reject(
                new Error(
                  `Upload failed for part ${part.partNumber}: ${xhr.statusText}`
                )
              );
            }
          };
          xhr.onerror = () =>
            reject(new Error(`Upload error for part ${part.partNumber}`));
          xhr.send(blob);
        }
      );
      uploadedParts.push(response);
    }
    return uploadedParts;
  }

  async completeMultipartUpload(
    s3Key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
    relativePath: string
  ) {
    const url = `http://13.203.227.138/api/s3/complete-multipart-upload?email=${encodeURIComponent(
      this.userSessionDetails!.username
    )}&bucketName=${encodeURIComponent(
      this.selectedBucket
    )}&key=${encodeURIComponent(s3Key)}&uploadId=${encodeURIComponent(
      uploadId
    )}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      this.uploadDetails.find((d) => d.name === relativePath)!.status =
        'failed';
      this.addLog(
        `Failed to complete multipart upload for ${relativePath}: ${errorText}`,
        true
      );
      throw new Error(`Failed to complete multipart upload: ${errorText}`);
    }
    this.uploadDetails.find((d) => d.name === relativePath)!.status =
      'uploaded';
    this.addLog(`Multipart upload completed for ${relativePath}`);
  }

  scheduleBackup(fileNames: string[]) {
    const backup: ScheduledBackup = {
      localPath: this.localPath,
      bucketName: this.selectedBucket,
      folderPath: this.currentPath || '',
      fileNames,
      backupTime: this.backupTime,
      retentionDays: this.retentionDays,
      backupFrequency: this.backupFrequency,
      dayOfWeek: this.backupFrequency === 'Weekly' ? this.dayOfWeek : undefined,
      dayOfMonth:
        this.backupFrequency === 'Monthly' ? this.dayOfMonth : undefined,
    };

    this.scheduledBackups.push(backup);
    this.saveScheduledBackups();
    this.startBackupScheduler(backup);
    this.addLog(
      `Scheduled backup for ${fileNames.length} files: ${backup.backupFrequency} at ${backup.backupTime}`
    );
  }

  loadScheduledBackups() {
    const stored = localStorage.getItem('scheduledBackups');
    if (stored) {
      this.scheduledBackups = JSON.parse(stored);
      this.scheduledBackups.forEach((backup) =>
        this.startBackupScheduler(backup)
      );
      this.addLog(`Loaded ${this.scheduledBackups.length} scheduled backups`);
    }
  }

  saveScheduledBackups() {
    localStorage.setItem(
      'scheduledBackups',
      JSON.stringify(
        this.scheduledBackups.map((b) => ({
          ...b,
          intervalId: undefined,
        }))
      )
    );
  }

  startBackupScheduler(backup: ScheduledBackup) {
    if (backup.intervalId) clearInterval(backup.intervalId);

    const checkBackup = () => {
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
            shouldRun =
              now.toLocaleString('en-US', { weekday: 'long' }) ===
              backup.dayOfWeek;
            break;
          case 'Monthly':
            shouldRun =
              now.getDate() ===
              Math.min(
                backup.dayOfMonth!,
                new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
              );
            break;
        }
      }

      if (shouldRun) {
        this.executeBackup(backup);
      }
    };

    backup.intervalId = setInterval(checkBackup, 60 * 1000);
  }

  async executeBackup(backup: ScheduledBackup) {
    this.addLog(
      `Executing scheduled backup for ${backup.fileNames.length} files to ${backup.bucketName}/${backup.folderPath}`
    );
    await this.handleFileUpload();
  }

  async retryUpload(detail: { name: string; size: number; status: string }) {
    if (detail.status !== 'failed') {
      alert('Retry is only available for failed uploads.');
      this.addLog(
        `Cannot retry ${detail.name}: Status is ${detail.status}`,
        true
      );
      return;
    }

    const file = this.originalFiles.find(
      (f) => ((f as any).webkitRelativePath || f.name) === detail.name
    );
    if (!file) {
      alert(`Please reselect ${detail.name} to retry the upload.`);
      this.addLog(`Cannot retry ${detail.name}: File not available`, true);
      return;
    }

    this.filesToUpload = [file];
    await this.handleFileUpload();
  }

  calculateUsedStorage() {
    // Simulate fetching used storage (replace with API call if available)
    let totalBytes = 0;
    this.uploadDetails.forEach((detail) => {
      if (detail.status === 'uploaded') {
        totalBytes += detail.size;
      }
    });
    this.usedStorage = totalBytes / (1024 * 1024 * 1024); // Convert bytes to GB
    this.usedStoragePercentage =
      (this.usedStorage / (this.totalStorage / 1024)) * 100; // Percentage of 5TB (in GB)
    this.cdr.detectChanges();
  }
}
