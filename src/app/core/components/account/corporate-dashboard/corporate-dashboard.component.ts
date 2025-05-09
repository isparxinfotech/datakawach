import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Chart } from 'chart.js/auto';
import * as JSZip from 'jszip';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-corporate-dashboard',
  templateUrl: './corporate-dashboard.component.html',
  styleUrls: ['./corporate-dashboard.component.css']
})
export class CorporateDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  cloudProvider: string = '';
  oneDriveContents: { name: string, id: string, size: number, type: string, downloadUrl?: string }[] = [];
  currentPath: string = '';
  pathHistory: string[] = [];
  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = ''; // New property for success messages
  totalSize: number = 0;
  totalStorage: number = 1_000_000_000_000; // 1 TB in bytes
  remainingStorage: number = this.totalStorage;

  // Rename folder state
  showRenameModal: boolean = false;
  selectedFolder: string = '';
  newFolderName: string = '';
  renameError: string = '';

  private subscription?: Subscription;
  private chart: Chart | undefined;

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails && this.userSessionDetails.username && this.userSessionDetails.cloudProvider) {
      this.email = this.userSessionDetails.username;
      this.cloudProvider = this.userSessionDetails.cloudProvider.toLowerCase();
      if (this.cloudProvider === 'onedrive') {
        this.listRootFolders();
      } else {
        this.errorMessage = 'Only OneDrive is supported for corporate dashboard.';
      }
    } else {
      this.errorMessage = 'User session details are incomplete. Please log in again.';
    }
  }

  ngAfterViewInit(): void {
    this.updateStorageChart();
  }

  listRootFolders(): void {
    this.currentPath = '';
    this.pathHistory = [];
    this.loadFolderContents('');
  }

  listFolderContents(folderName: string): void {
    if (!folderName) {
      this.errorMessage = 'Invalid folder name.';
      return;
    }
    const newPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    this.pathHistory.push(this.currentPath);
    this.currentPath = newPath;
    this.loadFolderContents(newPath);
  }

  navigateBack(): void {
    const previousPath = this.pathHistory.pop();
    this.currentPath = previousPath || '';
    this.loadFolderContents(this.currentPath);
  }

  navigateToPathSegment(index: number): void {
    const pathSegments = this.currentPath.split('/');
    if (index >= pathSegments.length) {
      this.errorMessage = 'Invalid navigation path.';
      return;
    }
    const newPath = pathSegments.slice(0, index + 1).join('/');
    this.pathHistory = this.pathHistory.slice(0, index);
    this.currentPath = newPath;
    this.loadFolderContents(newPath);
  }

  async downloadFolder(folderName: string): Promise<void> {
    if (!this.email) {
      this.errorMessage = 'Please provide an email.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = ''; // Clear success message
    const folderPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    const url = `https://datakavach.com/onedrive/download-folder?email=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`;

    console.log(`Downloading folder: ${folderPath} (URL: ${url})`);

    try {
      const files = await this.http.get<any[]>(url).toPromise();
      if (!files || !Array.isArray(files)) {
        this.errorMessage = 'Invalid response from server.';
        this.loading = false;
        return;
      }

      if (files.length && files[0].error) {
        this.errorMessage = files[0].error;
        this.loading = false;
        return;
      }

      if (files.length === 0) {
        this.errorMessage = `No files found in folder "${folderPath}".`;
        this.loading = false;
        return;
      }

      const zip = new JSZip();
      let hasFiles = false;
      for (const file of files) {
        if (file.type === 'file' && file.downloadUrl) {
          console.log(`Fetching file: ${file.name}`);
          try {
            const response = await this.http.get(file.downloadUrl, { responseType: 'blob' }).toPromise();
            if (response) {
              zip.file(file.name, response);
              hasFiles = true;
            } else {
              console.warn(`No content received for file: ${file.name}`);
              this.errorMessage += `Skipped ${file.name} (no content). `;
            }
          } catch (err: any) {
            console.error(`Failed to fetch file ${file.name}:`, err);
            this.errorMessage += `Failed to include ${file.name} in ZIP. `;
          }
        }
      }

      if (!hasFiles) {
        this.errorMessage = this.errorMessage || `No valid files were included in the ZIP for "${folderPath}".`;
        this.loading = false;
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${folderName}.zip`);
      console.log(`ZIP file created for folder: ${folderPath}`);
      this.loading = false;
    } catch (err: any) {
      this.loading = false;
      if (err.status === 404) {
        this.errorMessage = err.error?.message || `Folder "${folderPath}" not found.`;
      } else {
        this.errorMessage = err.error?.message || 'Failed to download folder. Please try again.';
      }
      console.error(`Error downloading folder: ${this.errorMessage}`, err);
    }
  }

  openRenameModal(folderName: string): void {
    this.selectedFolder = folderName;
    this.newFolderName = folderName;
    this.renameError = '';
    this.successMessage = ''; // Clear success message
    this.showRenameModal = true;
  }

  closeRenameModal(): void {
    this.showRenameModal = false;
    this.selectedFolder = '';
    this.newFolderName = '';
    this.renameError = '';
  }

  async renameFolder(): Promise<void> {
    if (!this.email || !this.newFolderName.trim()) {
      this.renameError = 'Please provide a valid folder name.';
      return;
    }

    const folderPath = this.currentPath ? `${this.currentPath}/${this.selectedFolder}` : this.selectedFolder;
    const url = `https://datakavach.com/onedrive/rename-folder?email=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}&newFolderName=${encodeURIComponent(this.newFolderName)}`;

    this.loading = true;
    this.renameError = '';
    this.successMessage = ''; // Clear success message

    try {
      const response = await this.http.patch(url, {}, { observe: 'response', responseType: 'text' }).toPromise();
      if (response && response.status >= 200 && response.status < 300) {
        this.closeRenameModal();
        this.loadFolderContents(this.currentPath);
        this.successMessage = response.body || 'Folder renamed successfully';
        console.log(`Folder renamed: ${folderPath} to ${this.newFolderName}`);
      } else {
        throw new Error(`Unexpected response: ${response ? response.status : 'undefined'}`);
      }
      this.loading = false;
    } catch (err: any) {
      this.loading = false;
      const errorMessage = err.error?.message || err.message || 'Failed to rename folder. Please try again.';
      this.renameError = errorMessage;
      console.error(`Error renaming folder: ${errorMessage}`, err);
    }
  }

  private loadFolderContents(folderPath: string): void {
    if (!this.email) {
      this.errorMessage = 'Please provide an email.';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = ''; // Clear success message
    this.oneDriveContents = [];
    this.totalSize = 0;

    const url = folderPath
      ? `https://datakavach.com/onedrive/folder-contents?email=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`
      : `https://datakavach.com/onedrive/folders?email=${encodeURIComponent(this.email)}`;

    console.log(`Loading contents for folder path: ${folderPath || 'root'} (URL: ${url})`);

    this.subscription = this.http.get<any[]>(url).subscribe({
      next: (response) => {
        if (!response || !Array.isArray(response)) {
          this.errorMessage = 'Invalid response from server.';
          this.loading = false;
          return;
        }
        this.oneDriveContents = response.map(item => ({
          name: item.name || 'Unknown',
          id: item.id || 'N/A',
          size: item.size || 0,
          type: item.type || 'folder',
          downloadUrl: item.downloadUrl
        }));
        this.totalSize = this.oneDriveContents.reduce((sum, item) => sum + item.size, 0);
        this.remainingStorage = this.totalStorage - this.totalSize;
        this.loading = false;
        this.updateStorageChart();
        if (this.oneDriveContents.length === 0) {
          this.errorMessage = `No items found in ${folderPath || 'root'}.`;
        }
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 404 && err.error?.message?.includes('Folder not found')) {
          this.errorMessage = err.error.message || `The folder "${folderPath || 'root'}" does not exist in your OneDrive. Please check the folder name and try again.`;
        } else {
          this.errorMessage = err.error?.message || 'Failed to list contents. Please try again.';
        }
        console.error(`Error loading folder contents: ${this.errorMessage}`, err);
      }
    });
  }

  updateStorageChart(): void {
    const ctx = document.getElementById('storageChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used Storage', 'Remaining Storage'],
        datasets: [{
          data: [this.totalSize, this.remainingStorage],
          backgroundColor: ['#007bff', '#e9ecef'],
          borderColor: ['#0056b3', '#ced4da'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.raw as number;
                return `${label}: ${this.formatSize(value)}`;
              }
            }
          }
        }
      }
    });
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.chart) {
      this.chart.destroy();
    }
  }
}