import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEventType } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Subscription, lastValueFrom } from 'rxjs';

// Utility function to limit concurrency with explicit type
function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
    let active = 0;
    const queue: Array<() => void> = [];
    async function run<T>(fn: () => Promise<T>): Promise<T> {
        if (active >= concurrency) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        active++;
        try {
            const result = await fn();
            return result;
        } finally {
            active--;
            if (queue.length > 0) {
                queue.shift()!();
            }
        }
    }
    return run;
}

// Interfaces
interface UploadResponse {
    successUrls: Array<{
        fileName: string;
        relativePath: string;
        uploadUrl: string;
        chunkIndex?: string;
        startByte?: string;
        endByte?: string;
        totalSize?: string;
        sessionId?: string;
    }>;
    errorMessages: Array<{ error: string }>;
}

interface ChunkMetadata {
    chunkIndex: number;
    startByte: number;
    endByte: number;
    totalSize: number;
    sessionId: string;
}

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

interface ContentInfo {
    name: string;
    id: string;
    size: number;
    type: 'file' | 'folder';
    downloadUrl?: string;
}

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

interface FileWithPath {
    file: File;
    relativePath: string;
    sanitizedFileName: string;
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
    currentFileProgress: { [key: string]: number } = {};
    currentFileIndex: number = 0;
    message: string = '';
    isSuccess: boolean = false;
    userSessionDetails: userSessionDetails | null | undefined = null;
    backupSchedules: BackupSchedule[] = [];
    rootFolders: FolderInfo[] = [];
    needsBackup: 'yes' | 'no' = 'yes';
    uploadType: 'file' | 'folder' = 'file';
    isLoading: boolean = true;
    isSchedulesLoading: boolean = false;
    isFolderContentsLoading: boolean = false;
    nextLink: string = '';
    private subscriptions: Subscription[] = [];
    private totalFiles: number = 0;
    private uploadedFiles: number = 0;
    private totalChunks: number = 0;
    private uploadedChunks: number = 0;
    public readonly MAX_PATH_LENGTH = 255;
    private readonly CONCURRENCY_LIMIT = 10;
    private readonly CHUNK_SIZE_ALIGNMENT = 327680;
    private readonly MAX_RETRIES = 3;
    private readonly BATCH_SIZE = 20; // Aligned with backend BATCH_SIZE

    constructor(
        private http: HttpClient,
        private authService: AuthService,
        private cdr: ChangeDetectorRef
    ) {}

    get isCustomerUserType(): boolean {
        return String(this.userSessionDetails?.userType) === '8';
    }

    ngOnInit(): void {
        this.isLoading = true;
        this.initializeUser();
    }

    public getPathUpToIndex(index: number): string {
        return this.folderPathSegments.slice(0, index + 1).join('/');
    }

    private sanitizeFileName(fileName: string): string {
        const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
        const baseName = fileName.replace(`.${extension}`, '');
        const sanitized = baseName
            .replace(/\s+|[.]+/g, '_')
            .replace(/[<>:"\/\\|?*]+/g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '');
        const maxBaseLength = this.MAX_PATH_LENGTH - (extension ? extension.length + 1 : 0);
        const truncatedBase = sanitized.substring(0, maxBaseLength);
        return truncatedBase + (extension ? `.${extension}` : '');
    }

    async initializeUser() {
        this.message = '';
        this.userSessionDetails = this.authService.getLoggedInUserDetails();
        console.log('userSessionDetails:', this.userSessionDetails);

        if (!this.userSessionDetails?.jwtToken || !this.userSessionDetails?.username) {
            const url = `https://datakavach.com/users/current`;
            try {
                const response = await lastValueFrom(this.http.get<userSessionDetails>(url, {
                    headers: this.getAuthHeaders()
                }));
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
        this.currentFileProgress = {};
        this.currentFileIndex = 0;
        this.totalFiles = 0;
        this.uploadedFiles = 0;
        this.totalChunks = 0;
        this.uploadedChunks = 0;
        this.message = '';
        this.cdr.detectChanges();
    }

    validateFileNameInput(): void {
        this.fileNameError = '';
        if (!this.fileName && this.uploadType === 'file') {
            this.fileNameError = 'File name is required';
        } else if (this.fileName) {
            if (/[<>:"\/\\|?*]/.test(this.fileName)) {
                this.fileNameError = 'File name contains invalid characters';
            } else if (this.fileName.length > this.MAX_PATH_LENGTH) {
                this.fileNameError = `File name is too long (max ${this.MAX_PATH_LENGTH} characters)`;
            }
        }
        this.cdr.detectChanges();
    }

    onFilesSelected(event: any) {
        this.selectedFiles = [];
        this.message = '';
        this.overallProgress = 0;
        this.currentFileProgress = {};
        this.currentFileIndex = 0;
        this.totalFiles = 0;
        this.uploadedFiles = 0;
        this.totalChunks = 0;
        this.uploadedChunks = 0;

        const files: File[] = Array.from(event.target.files);
        let topLevelFolder = '';
        const skippedFiles: string[] = [];

        for (const file of files) {
            if (file.size <= 0) {
                skippedFiles.push(`Invalid file size for ${file.name}: ${file.size} bytes`);
                console.warn(`Skipping file ${file.name} due to invalid size: ${file.size} bytes`);
                continue;
            }
            let relativePath = '';
            const sanitizedFileName = this.sanitizeFileName(file.name);
            if (this.uploadType === 'folder' && file.webkitRelativePath) {
                relativePath = file.webkitRelativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                if (!topLevelFolder) {
                    topLevelFolder = relativePath.split('/')[0];
                }
                relativePath = relativePath.startsWith(topLevelFolder + '/')
                    ? relativePath.substring(topLevelFolder.length + 1)
                    : relativePath;
                relativePath = relativePath
                    .split('/')
                    .map(segment => this.sanitizeFileName(segment))
                    .join('/');
                if (!relativePath) {
                    relativePath = '.';
                }
                if (relativePath.length > this.MAX_PATH_LENGTH) {
                    skippedFiles.push(`Relative path too long for ${file.name} (max ${this.MAX_PATH_LENGTH} characters)`);
                    console.warn(`Skipping file ${file.name} due to relative path length: ${relativePath.length}`);
                    continue;
                }
            }
            this.selectedFiles.push({ file, relativePath, sanitizedFileName });
        }

        if (skippedFiles.length > 0) {
            this.message = `Skipped ${skippedFiles.length} invalid file(s): ${skippedFiles.join('; ')}`;
            this.isSuccess = false;
            this.cdr.detectChanges();
        }

        if (this.selectedFiles.length > 0) {
            this.totalFiles = this.selectedFiles.length;
            this.fileName = this.uploadType === 'file' ? this.selectedFiles[0].sanitizedFileName : this.sanitizeFileName(topLevelFolder);
            this.validateFileNameInput();
        } else if (skippedFiles.length > 0 && files.length === skippedFiles.length) {
            this.message = `All selected files were invalid and skipped: ${skippedFiles.join('; ')}`;
            this.isSuccess = false;
            this.cdr.detectChanges();
            return;
        }

        console.log('Selected files:', this.selectedFiles.map(item => ({
            original: item.file.name,
            sanitized: item.sanitizedFileName,
            relativePath: item.relativePath
        })));
        console.log(`Total files selected: ${this.selectedFiles.length}, Skipped files: ${skippedFiles.length}`);
        this.cdr.detectChanges();
    }

    isScheduleFormValid(): boolean {
        if (this.needsBackup === 'no') {
            return !!(
                this.userSessionDetails?.username &&
                this.folderPath &&
                this.folderPath.trim() !== '' &&
                (this.uploadType === 'folder' || (this.fileName && !this.fileNameError)) &&
                this.selectedFiles.length > 0
            );
        }
        return !!(
            this.userSessionDetails?.username &&
            this.folderPath &&
            this.folderPath.trim() !== '' &&
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
            await lastValueFrom(this.http.post(url, body, {
                headers: this.getAuthHeaders()
            }));
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
            await lastValueFrom(this.http.post(url, body, {
                headers: this.getAuthHeaders()
            }));
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
            const response = await lastValueFrom(this.http.get<{ schedules: BackupSchedule[] }>(url, {
                headers: this.getAuthHeaders()
            }));
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

        if (userType !== undefined && String(userType) === '8') {
            url = `https://datakavach.com/isparxcloud/customer-folder?username=${encodeURIComponent(this.userSessionDetails.username)}`;
        } else if (isRetentionNeeded) {
            url = `https://datakavach.com/isparxcloud/user-folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;
        } else {
            url = `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.userSessionDetails.username)}`;
        }

        try {
            if (userType !== undefined && String(userType) === '8') {
                const response = await lastValueFrom(this.http.get<CustomerFolderResponse>(url, {
                    headers: this.getAuthHeaders()
                }));
                if (!response || typeof response !== 'object' || !response.folder) {
                    throw new Error('Invalid response format: Expected { folder: string }');
                }
                this.rootFolders = [{
                    name: response.folder || 'Unknown Folder',
                    id: '',
                    size: 0
                }];
                this.nextLink = '';
                this.selectedRootFolder = this.rootFolders[0].name;
                this.onRootFolderChange();
            } else if (isRetentionNeeded) {
                const response = await lastValueFrom(this.http.get<UserFoldersResponse>(url, {
                    headers: this.getAuthHeaders()
                }));
                this.rootFolders = response?.folders.map(name => ({ name, id: '', size: 0 })) || [];
                this.nextLink = '';
            } else {
                const response = await lastValueFrom(this.http.get<{ folders: FolderInfo[], nextLink: string }>(url, {
                    headers: this.getAuthHeaders()
                }));
                this.rootFolders = response?.folders || [];
                this.nextLink = response?.nextLink || '';
            }

            if (this.rootFolders.length === 0) {
                this.message = 'No folders found in cloud storage. Please create a folder.';
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

    onRootFolderChange(): void {
        if (this.selectedRootFolder) {
            this.folderPath = this.selectedRootFolder;
            this.folderPathSegments = this.folderPath.split('/').filter(segment => segment);
            this.message = '';
            this.folderContents = [];
            this.nextLink = '';
            this.loadFolderContents(this.folderPath);
        } else {
            this.folderPath = '';
            this.folderPathSegments = [];
            this.folderContents = [];
            this.nextLink = '';
            this.message = 'No root folder selected';
            this.isSuccess = false;
        }
        this.cdr.detectChanges();
    }

    navigateToFolder(path: string): void {
        this.folderPath = path || 'root';
        this.folderPathSegments = this.folderPath === 'root' ? [] : this.folderPath.split('/').filter(segment => segment);
        this.message = '';
        this.folderContents = [];
        this.nextLink = '';
        this.loadFolderContents(this.folderPath);
        this.cdr.detectChanges();
    }

    selectSubFolder(folderName: string): void {
        if (!this.folderPath || this.folderPath === 'root') {
            this.folderPath = folderName;
        } else {
            this.folderPath = `${this.folderPath}/${folderName}`;
        }
        this.folderPathSegments = this.folderPath.split('/').filter(segment => segment);
        this.message = '';
        this.folderContents = [];
        this.nextLink = '';
        this.loadFolderContents(this.folderPath);
        this.cdr.detectChanges();
    }

    onFrequencyChange(): void {
        this.dayOfWeek = '';
        this.dayOfMonth = null;
        this.message = '';
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
            const response = await lastValueFrom(this.http.get<{ contents: ContentInfo[], nextLink: string }>(url, {
                headers: this.getAuthHeaders()
            }));
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

    async onUpload() {
        if (!this.userSessionDetails?.username || !this.folderPath || this.selectedFiles.length === 0) {
            this.message = 'Please select a folder and at least one file or folder for upload';
            this.isSuccess = false;
            this.uploading = false;
            this.cdr.detectChanges();
            return;
        }

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
        this.currentFileProgress = {};
        this.currentFileIndex = 0;
        this.totalFiles = this.selectedFiles.length;
        this.uploadedFiles = 0;
        this.totalChunks = 0;
        this.uploadedChunks = 0;
        this.message = this.uploadType === 'folder' ? 'Preparing folder structure for upload...' : 'Preparing files for upload...';
        this.cdr.detectChanges();

        const limit = pLimit(this.CONCURRENCY_LIMIT);
        let successfulUploads = 0;

        if (this.uploadType === 'file') {
            const uploadPromises: Promise<boolean>[] = [];
            const fileChunkCounts = new Map<string, { total: number; uploaded: number }>();

            // Initialize chunk counts and progress for each file
            for (const { file, sanitizedFileName } of this.selectedFiles) {
                const rawFileName = this.fileName || sanitizedFileName;
                fileChunkCounts.set(rawFileName, { total: 0, uploaded: 0 });
                this.currentFileProgress[rawFileName] = 0;
            }

            for (let i = 0; i < this.selectedFiles.length; i++) {
                const { file, sanitizedFileName } = this.selectedFiles[i];
                const rawFileName = this.fileName || sanitizedFileName;

                uploadPromises.push(limit(async () => {
                    try {
                        const url = 'https://datakavach.com/isparxcloud/generate-upload-url';
                        const formData = new FormData();
                        formData.append('username', this.userSessionDetails!.username);
                        formData.append('folderName', normalizedFolderPath);
                        formData.append('fileName', rawFileName);
                        formData.append('fileSize', file.size.toString());

                        console.log('Requesting presigned URL for:', {
                            fileName: rawFileName,
                            fileSize: file.size,
                            folder: normalizedFolderPath
                        });
                        const response = await lastValueFrom(this.http.post<UploadResponse>(url, formData, {
                            headers: this.getAuthHeaders()
                        }));

                        if (!response || response.errorMessages.length > 0) {
                            const errors = response?.errorMessages.map(err => err.error) || ['Failed to generate presigned URL'];
                            throw new Error(`Failed to upload ${rawFileName}: ${errors.join('; ')}`);
                        }

                        console.log('Presigned URL response:', JSON.stringify(response, null, 2));

                        const sortedUrls = response.successUrls
                            .filter(url => url.fileName === rawFileName)
                            .sort((a, b) => {
                                const indexA = a.chunkIndex ? parseInt(a.chunkIndex, 10) : 0;
                                const indexB = b.chunkIndex ? parseInt(b.chunkIndex, 10) : 0;
                                return indexA - indexB;
                            });

                        if (sortedUrls.length === 0) {
                            throw new Error(`No valid presigned URLs received for ${rawFileName}`);
                        }

                        fileChunkCounts.set(rawFileName, { ...fileChunkCounts.get(rawFileName)!, total: sortedUrls.length });
                        this.totalChunks += sortedUrls.length;

                        for (const presigned of sortedUrls) {
                            console.log(`Processing chunk ${presigned.chunkIndex || 'single'} for ${rawFileName}`);
                            const success = await this.uploadWithRetry(
                                file,
                                presigned,
                                rawFileName,
                                i,
                                this.selectedFiles.length,
                                sortedUrls.length,
                                normalizedFolderPath,
                                fileChunkCounts
                            );
                            if (!success) {
                                throw new Error(`Failed to upload chunk ${presigned.chunkIndex || 'unknown'} for ${rawFileName}`);
                            }
                            fileChunkCounts.get(rawFileName)!.uploaded++;
                            this.uploadedChunks++;
                        }

                        // Update progress only when all chunks of the file are uploaded
                        this.currentFileProgress[rawFileName] = 100;
                        this.uploadedFiles++;
                        this.overallProgress = Math.min(Math.round((this.uploadedFiles / this.totalFiles) * 100), 100);
                        console.log(`All chunks uploaded for ${rawFileName}, file progress: 100%, overall progress: ${this.overallProgress}%`);
                        this.message = `Completed upload of file ${this.uploadedFiles} of ${this.totalFiles}: ${rawFileName}`;
                        this.cdr.detectChanges();
                        return true;
                    } catch (err: any) {
                        this.handleError(err);
                        return false;
                    }
                }));
            }

            try {
                const results = await Promise.all(uploadPromises);
                successfulUploads = results.filter(success => success).length;
                if (successfulUploads === this.selectedFiles.length) {
                    this.handleSuccess(`All ${successfulUploads} files uploaded successfully`);
                } else {
                    this.handleError(new Error(`Only ${successfulUploads} of ${this.selectedFiles.length} files uploaded successfully`));
                }
            } catch (err: any) {
                this.handleError(err);
            } finally {
                this.uploading = false;
                this.cdr.detectChanges();
            }
        } else {
            // Batch processing for folder upload
            const topLevelFolder = this.fileName || 'uploaded_folder';
            const finalFolderPath = normalizedFolderPath ? `${normalizedFolderPath}/${this.sanitizeFileName(topLevelFolder)}` : this.sanitizeFileName(topLevelFolder);

            // Split files into batches aligned with backend BATCH_SIZE
            const batches: FileWithPath[][] = [];
            for (let i = 0; i < this.selectedFiles.length; i += this.BATCH_SIZE) {
                batches.push(this.selectedFiles.slice(i, i + this.BATCH_SIZE));
            }

            // Initialize chunk counts for each file
            const fileChunkCounts = new Map<string, { total: number; uploaded: number; file: File }>();
            this.selectedFiles.forEach(item => {
                const key = `${item.sanitizedFileName}|${item.relativePath}`;
                fileChunkCounts.set(key, { total: 0, uploaded: 0, file: item.file });
                this.currentFileProgress[key] = 0;
            });

            this.message = `Preparing to upload ${this.selectedFiles.length} files in ${batches.length} batches...`;
            this.cdr.detectChanges();

            let totalFilesProcessed = 0;
            const batchErrors: string[] = [];

            // Process each batch and start uploads immediately
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                await limit(async () => {
                    try {
                        const url = 'https://datakavach.com/isparxcloud/upload-folder';
                        const formData = new FormData();
                        formData.append('email', this.userSessionDetails!.username);
                        formData.append('baseFolderName', finalFolderPath);
                        formData.append('fileNames', batch.map(item => item.sanitizedFileName).join(','));
                        formData.append('fileSizes', batch.map(item => item.file.size.toString()).join(','));
                        formData.append('relativePaths', batch.map(item => item.relativePath).join(','));

                        console.log(`Requesting presigned URLs for batch ${batchIndex + 1}/${batches.length}:`, {
                            baseFolderName: finalFolderPath,
                            filesCount: batch.length,
                            fileNames: batch.map(item => item.sanitizedFileName),
                            fileSizes: batch.map(item => item.file.size),
                            relativePaths: batch.map(item => item.relativePath)
                        });

                        const response = await lastValueFrom(this.http.post<UploadResponse>(url, formData, {
                            headers: this.getAuthHeaders()
                        }));

                        console.log(`Folder upload presigned URLs for batch ${batchIndex + 1}:`, JSON.stringify(response, null, 2));

                        if (!response || response.errorMessages.length > 0) {
                            const errors = response?.errorMessages.map(err => err.error) || ['Failed to generate presigned URLs for batch'];
                            throw new Error(`Batch ${batchIndex + 1} failed: ${errors.join('; ')}`);
                        }

                        this.totalChunks += response.successUrls.length;

                        batch.forEach(item => {
                            const key = `${item.sanitizedFileName}|${item.relativePath}`;
                            const totalChunks = response.successUrls.filter(url => url.fileName === item.sanitizedFileName && url.relativePath === item.relativePath).length;
                            fileChunkCounts.set(key, { ...fileChunkCounts.get(key)!, total: totalChunks });
                        });

                        const fileUrlGroups = new Map<string, UploadResponse['successUrls']>();
                        response.successUrls.forEach(url => {
                            const key = `${url.fileName}|${url.relativePath}`;
                            if (!fileUrlGroups.has(key)) {
                                fileUrlGroups.set(key, []);
                            }
                            fileUrlGroups.get(key)!.push(url);
                        });

                        const filePromises: Promise<boolean>[] = [];

                        for (const [key, urls] of fileUrlGroups) {
                            const sortedUrls = urls.sort((a, b) => {
                                const indexA = a.chunkIndex ? parseInt(a.chunkIndex, 10) : 0;
                                const indexB = b.chunkIndex ? parseInt(b.chunkIndex, 10) : 0;
                                return indexA - indexB;
                            });
                            const [fileName, relativePath] = key.split('|');
                            const fileItem = batch.find(item => item.sanitizedFileName === fileName && item.relativePath === relativePath);
                            if (!fileItem) {
                                console.warn(`No matching file found for presigned URL: ${fileName}, relativePath: ${relativePath}`);
                                continue;
                            }

                            filePromises.push(limit(async () => {
                                try {
                                    const totalChunks = sortedUrls.length;
                                    let uploadedChunks = 0;

                                    for (const presigned of sortedUrls) {
                                        console.log(`Processing chunk ${presigned.chunkIndex || 'single'} for ${fileName} (relativePath: ${relativePath})`);
                                        const success = await this.uploadWithRetry(
                                            fileItem.file,
                                            presigned,
                                            fileName,
                                            totalFilesProcessed,
                                            this.selectedFiles.length,
                                            totalChunks,
                                            finalFolderPath,
                                            fileChunkCounts
                                        );
                                        if (!success) {
                                            throw new Error(`Failed to upload chunk ${presigned.chunkIndex || 'unknown'} for ${fileName} (relativePath: ${relativePath})`);
                                        }
                                        uploadedChunks++;
                                        this.uploadedChunks++;
                                        fileChunkCounts.get(key)!.uploaded = uploadedChunks;
                                    }

                                    // Update progress only when all chunks of the file are uploaded
                                    this.currentFileProgress[key] = 100;
                                    this.uploadedFiles++;
                                    this.overallProgress = Math.min(Math.round((this.uploadedFiles / this.totalFiles) * 100), 100);
                                    console.log(`All chunks uploaded for ${fileName} (relativePath: ${relativePath}), file progress: 100%, overall progress: ${this.overallProgress}%`);
                                    this.message = `Completed upload of file ${this.uploadedFiles} of ${this.totalFiles}: ${fileName}`;
                                    totalFilesProcessed++;
                                    this.cdr.detectChanges();
                                    return true;
                                } catch (err: any) {
                                    console.error(`Failed to upload file ${fileName} (relativePath: ${relativePath}):`, err);
                                    this.handleError(new Error(`Failed to upload ${fileName} (relativePath: ${relativePath}): ${err.message || err}`));
                                    return false;
                                }
                            }));
                        }

                        const fileResults = await Promise.all(filePromises);
                        successfulUploads += fileResults.filter(success => success).length;
                        if (!fileResults.every(success => success)) {
                            batchErrors.push(`Batch ${batchIndex + 1} had ${fileResults.filter(success => !success).length} file(s) fail`);
                        }
                    } catch (err: any) {
                        console.error(`Batch ${batchIndex + 1} upload exception:`, err);
                        batchErrors.push(`Batch ${batchIndex + 1} failed: ${err.message || err}`);
                    }
                });
            }

            // Wait for all batches to complete
            for (let i = 0; i < this.CONCURRENCY_LIMIT; i++) {
                await limit(() => Promise.resolve());
            }

            try {
                if (batchErrors.length === 0 && successfulUploads === this.selectedFiles.length) {
                    this.handleSuccess(`Folder uploaded successfully: ${successfulUploads} files processed in ${batches.length} batches`);
                } else {
                    this.handleError(new Error(`Only ${successfulUploads} of ${this.selectedFiles.length} files uploaded successfully in ${batches.length} batches. Errors: ${batchErrors.join('; ')}`));
                }
            } catch (err: any) {
                console.error('Folder upload exception:', err);
                this.handleError(err);
            } finally {
                this.uploading = false;
                this.loadFolderContents(this.folderPath);
                this.cdr.detectChanges();
            }
        }
    }

    private async refreshPresignedUrl(
        file: File,
        fileName: string,
        normalizedFolderPath: string,
        relativePath: string,
        chunkIndex: number,
        startByte: number,
        endByte: number,
        totalSize: number
    ): Promise<UploadResponse['successUrls'][0] | null> {
        const url = this.uploadType === 'file' ? 'https://datakavach.com/isparxcloud/generate-upload-url' : 'https://datakavach.com/isparxcloud/upload-folder';
        const formData = new FormData();
        formData.append('username', this.userSessionDetails!.username);
        formData.append('folderName', normalizedFolderPath);
        formData.append('fileName', fileName);
        formData.append('fileSize', file.size.toString());
        if (this.uploadType === 'folder') {
            formData.append('baseFolderName', normalizedFolderPath);
            formData.append('fileNames', fileName);
            formData.append('fileSizes', file.size.toString());
            formData.append('relativePaths', relativePath || '.');
        }

        try {
            console.log(`Requesting new presigned URL for ${fileName} (relativePath: ${relativePath}, chunkIndex: ${chunkIndex})`);
            const response = await lastValueFrom(this.http.post<UploadResponse>(url, formData, {
                headers: this.getAuthHeaders()
            }));

            if (!response || response.errorMessages.length > 0) {
                const errors = response?.errorMessages.map(err => err.error) || ['Failed to generate new presigned URL'];
                throw new Error(`Failed to refresh presigned URL for ${fileName}: ${errors.join('; ')}`);
            }

            const newUrl = response.successUrls.find(u => u.fileName === fileName && u.relativePath === (relativePath || '.') && u.chunkIndex === chunkIndex.toString());
            if (!newUrl) {
                throw new Error(`No matching presigned URL found for ${fileName} (relativePath: ${relativePath}, chunkIndex: ${chunkIndex})`);
            }
            console.log(`Refreshed presigned URL for ${fileName} (chunk ${chunkIndex}):`, newUrl.uploadUrl);
            return newUrl;
        } catch (err: any) {
            console.error(`Failed to refresh presigned URL for ${fileName} (relativePath: ${relativePath}, chunkIndex: ${chunkIndex}):`, err);
            return null;
        }
    }

    private async uploadWithRetry(
        file: File,
        presigned: UploadResponse['successUrls'][0],
        fileName: string,
        fileIndex: number,
        totalFiles: number,
        totalChunks: number,
        normalizedFolderPath: string,
        fileChunkCounts: Map<string, { total: number; uploaded: number; file?: File }>,
        maxRetries: number = this.MAX_RETRIES
    ): Promise<boolean> {
        let retries = 0;
        let isChunked = false;
        let chunkMetadata: ChunkMetadata | undefined;
        let currentPresigned = presigned;
        const progressKey = this.uploadType === 'folder' ? `${fileName}|${presigned.relativePath}` : fileName;

        console.log(`Starting upload for ${fileName} (relativePath: ${presigned.relativePath || '.'}, chunkIndex: ${presigned.chunkIndex || 'single'})`);
        console.log(`Presigned metadata:`, JSON.stringify(currentPresigned, null, 2));
        console.log(`isChunked check:`, {
            hasChunkIndex: !!currentPresigned.chunkIndex,
            hasStartByte: !!currentPresigned.startByte,
            hasEndByte: !!currentPresigned.endByte,
            hasTotalSize: !!currentPresigned.totalSize,
            hasSessionId: !!currentPresigned.sessionId,
            fileSize: file.size,
            uploadUrl: currentPresigned.uploadUrl,
            totalChunks
        });

        isChunked =
            currentPresigned.chunkIndex !== undefined &&
            currentPresigned.startByte !== undefined &&
            currentPresigned.endByte !== undefined &&
            currentPresigned.totalSize !== undefined &&
            currentPresigned.sessionId !== undefined;

        while (retries < maxRetries) {
            try {
                let payload: Blob = file;
                let contentRange = '';
                let headers = new HttpHeaders({
                    'Content-Type': file.type || 'application/octet-stream',
                    ...(currentPresigned.sessionId && { 'x-ms-session-id': currentPresigned.sessionId })
                });

                if (isChunked) {
                    chunkMetadata = {
                        chunkIndex: parseInt(currentPresigned.chunkIndex!, 10),
                        startByte: parseInt(currentPresigned.startByte!, 10),
                        endByte: parseInt(currentPresigned.endByte!, 10),
                        totalSize: parseInt(currentPresigned.totalSize!, 10),
                        sessionId: currentPresigned.sessionId!
                    };

                    if (
                        isNaN(chunkMetadata.chunkIndex) ||
                        isNaN(chunkMetadata.startByte) ||
                        isNaN(chunkMetadata.endByte) ||
                        isNaN(chunkMetadata.totalSize)
                    ) {
                        throw new Error(`Invalid chunk metadata for ${fileName}: ${JSON.stringify(chunkMetadata)}`);
                    }

                    if (chunkMetadata.totalSize !== file.size) {
                        throw new Error(
                            `Chunk metadata mismatch for ${fileName}: expected totalSize=${file.size}, got ${chunkMetadata.totalSize}`
                        );
                    }

                    if (
                        chunkMetadata.startByte < 0 ||
                        chunkMetadata.endByte < chunkMetadata.startByte ||
                        chunkMetadata.endByte >= chunkMetadata.totalSize ||
                        chunkMetadata.startByte >= chunkMetadata.totalSize
                    ) {
                        throw new Error(
                            `Invalid chunk range for ${fileName}: startByte=${chunkMetadata.startByte}, endByte=${chunkMetadata.endByte}, totalSize=${chunkMetadata.totalSize}`
                        );
                    }

                    const chunkSize = chunkMetadata.endByte - chunkMetadata.startByte + 1;
                    if (chunkSize % this.CHUNK_SIZE_ALIGNMENT !== 0 && chunkMetadata.endByte + 1 !== chunkMetadata.totalSize) {
                        console.warn(
                            `Chunk size for ${fileName} (chunk ${chunkMetadata.chunkIndex}) is ${chunkSize} bytes, not aligned to 320KB (${this.CHUNK_SIZE_ALIGNMENT} bytes). Proceeding anyway.`
                        );
                    }

                    payload = file.slice(chunkMetadata.startByte, chunkMetadata.endByte + 1);
                    contentRange = `bytes ${chunkMetadata.startByte}-${chunkMetadata.endByte}/${chunkMetadata.totalSize}`;
                    headers = headers.set('Content-Range', contentRange);

                    console.log(`Chunked upload details:`, {
                        chunkIndex: chunkMetadata.chunkIndex,
                        contentRange,
                        startByte: chunkMetadata.startByte,
                        endByte: chunkMetadata.endByte,
                        totalSize: chunkMetadata.totalSize,
                        chunkSize,
                        sessionId: chunkMetadata.sessionId
                    });
                } else {
                    console.log(`Non-chunked upload for ${fileName}:`, { fileSize: file.size });
                    if (currentPresigned.uploadUrl.includes('/uploadSession') && totalChunks === 1) {
                        contentRange = `bytes 0-${file.size - 1}/${file.size}`;
                        headers = headers.set('Content-Range', contentRange);
                        console.log(`Single-chunk /uploadSession for ${fileName}:`, { contentRange });
                    }
                }

                let uploadSuccess = false;
                await new Promise<void>((resolve, reject) => {
                    const subscription = this.http.put(currentPresigned.uploadUrl, payload, {
                        headers,
                        reportProgress: true,
                        observe: 'events'
                    }).subscribe({
                        next: (event: any) => {
                            if (event.type === HttpEventType.UploadProgress && event.total) {
                                // Optional: Log progress for debugging, but don't update UI here
                                const chunkProgress = Math.round((event.loaded / event.total) * 100);
                                console.log(`Upload progress for ${fileName} (chunk ${chunkMetadata?.chunkIndex || 'single'}): ${chunkProgress}%`);
                            } else if (event.type === HttpEventType.Response) {
                                console.log(
                                    `OneDrive response for ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex}/${totalChunks})` : ''}:`,
                                    JSON.stringify(event.body, null, 2),
                                    `Status: ${event.status}`
                                );
                                if (isChunked) {
                                    if (event.status === 202) {
                                        if (event.body && event.body.nextExpectedRanges) {
                                            uploadSuccess = true;
                                        } else {
                                            throw new Error(`Invalid response for chunk ${chunkMetadata!.chunkIndex} of ${fileName}: Missing nextExpectedRanges`);
                                        }
                                    } else if (event.status === 201 || event.status === 200) {
                                        if (chunkMetadata!.endByte + 1 === chunkMetadata!.totalSize) {
                                            if (event.body && event.body.id && event.body.name) {
                                                uploadSuccess = true;
                                            } else {
                                                throw new Error(`Final chunk for ${fileName} response missing file metadata: ${JSON.stringify(event.body)}`);
                                            }
                                        } else {
                                            throw new Error(`Unexpected 201/200 status for non-final chunk ${chunkMetadata!.chunkIndex} of ${fileName}`);
                                        }
                                    } else {
                                        throw new Error(`Unexpected status ${event.status} for chunk ${chunkMetadata!.chunkIndex} of ${fileName}`);
                                    }
                                } else {
                                    if (event.status === 201 || event.status === 200) {
                                        if (event.body && event.body.id && event.body.name) {
                                            uploadSuccess = true;
                                        } else {
                                            throw new Error(`Non-chunked upload for ${fileName} response missing file metadata: ${JSON.stringify(event.body)}`);
                                        }
                                    } else {
                                        throw new Error(`Unexpected status ${event.status} for non-chunked upload of ${fileName}`);
                                    }
                                }
                            }
                        },
                        error: (err: any) => {
                            let errorMessage = `Failed to upload ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex ?? 'unknown'}/${totalChunks})` : ''}: ${err.status} ${err.statusText}`;
                            if (err.error && err.error.error && err.error.error.message) {
                                errorMessage += ` - ${err.error.error.message}`;
                            }
                            console.error('Upload error details:', JSON.stringify(err, null, 2));
                            reject(new Error(errorMessage));
                        },
                        complete: () => {
                            console.log(`Upload completed for ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex ?? 'unknown'}/${totalChunks})` : ''}`);
                            resolve();
                        }
                    });
                    this.subscriptions.push(subscription);
                });

                if (uploadSuccess) {
                    console.log(`Upload successful for ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex}/${totalChunks})` : ''}`);
                    fileChunkCounts.get(progressKey)!.uploaded++;
                    return true;
                }
                throw new Error(`Upload failed for ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex}/${totalChunks})` : ''}`);
            } catch (err: any) {
                if (retries < maxRetries - 1) {
                    retries++;
                    const retryAfter = err.status && [429, 503, 416, 409].includes(err.status)
                        ? (err.headers?.get('Retry-After') ? parseInt(err.headers.get('Retry-After'), 10) * 1000 : 1000 * (2 ** retries))
                        : 1000 * (2 ** retries);
                    console.warn(`Retrying upload for ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex ?? 'unknown'}/${totalChunks})` : ''}, attempt ${retries + 1} after ${retryAfter}ms`);

                    if (isChunked && (err.message.includes('eTag mismatch') || err.message.includes('Invalid chunk range') || err.status === 416 || err.status === 409)) {
                        const newUrl = await this.refreshPresignedUrl(
                            file,
                            fileName,
                            normalizedFolderPath,
                            presigned.relativePath || '.',
                            chunkMetadata!.chunkIndex,
                            chunkMetadata!.startByte,
                            chunkMetadata!.endByte,
                            chunkMetadata!.totalSize
                        );
                        if (newUrl) {
                            currentPresigned = newUrl;
                            console.log(`Refreshed presigned URL for ${fileName} (chunk ${chunkMetadata!.chunkIndex}):`, newUrl.uploadUrl);
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, retryAfter));
                    continue;
                }
                const errorMessage = `Failed to upload ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex ?? 'unknown'}/${totalChunks})` : ''} after ${maxRetries} attempts: ${err.message || err}`;
                this.handleError(new Error(errorMessage));
                return false;
            }
        }
        const finalError = `Failed to upload ${fileName}${isChunked ? ` (chunk ${chunkMetadata?.chunkIndex ?? 'unknown'}/${totalChunks})` : ''} after ${maxRetries} attempts`;
        this.handleError(new Error(finalError));
        return false;
    }

    private getAuthHeaders(): HttpHeaders {
        const token = this.userSessionDetails?.jwtToken || '';
        return new HttpHeaders({
            'Authorization': `Bearer ${token}`
        });
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
        } else if (Array.isArray(error)) {
            errorMessage = error.map((err: any) => err.error || err).join('; ');
        }
        this.message = errorMessage;
        if (errorMessage.includes('/uploadSession') || errorMessage.includes('eTag mismatch') || errorMessage.includes('429')) {
            this.message += '. The file(s) may have partially uploaded or hit a rate limit. Please check the destination folder in OneDrive and try again.';
        }
        this.isLoading = false;
        const modal = new (window as any).bootstrap.Modal(document.getElementById('errorModal'));
        modal.show();
        this.cdr.detectChanges();
    }

    private handleSuccess(response: any) {
        this.uploading = false;
        this.scheduling = false;
        this.isSuccess = true;
        this.message = typeof response === 'string' ? response : 'Operation completed successfully!';
        const modal = new (window as any).bootstrap.Modal(document.getElementById('successModal'));
        modal.show();
        const currentNeedsBackup = this.needsBackup;
        const currentFolderPath = this.folderPath;
        const currentSelectedRootFolder = this.selectedRootFolder;
        this.resetForm();
        this.needsBackup = currentNeedsBackup;
        this.folderPath = currentFolderPath;
        this.selectedRootFolder = currentSelectedRootFolder;
        this.folderPathSegments = this.folderPath ? this.folderPath.split('/') : [];
        this.folderName = this.folderPath;
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
        this.currentFileProgress = {};
        this.currentFileIndex = 0;
        this.totalFiles = 0;
        this.uploadedFiles = 0;
        this.totalChunks = 0;
        this.uploadedChunks = 0;
        this.message = '';
        this.isSuccess = false;
        this.cdr.detectChanges();
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }
}