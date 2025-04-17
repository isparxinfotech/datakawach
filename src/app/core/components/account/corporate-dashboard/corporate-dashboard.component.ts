import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-corporate-dashboard',
  templateUrl: './corporate-dashboard.component.html',
  styleUrls: ['./corporate-dashboard.component.css']
})
export class CorporateDashboardComponent implements OnInit, OnDestroy {
toggleSidebar() {
throw new Error('Method not implemented.');
}
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  cloudProvider: string = '';
  oneDriveContents: { name: string, id: string, size: number, type: string, downloadUrl?: string }[] = [];
  currentPath: string = '';
  pathHistory: string[] = [];
  loading: boolean = false;
  errorMessage: string = '';

  private subscription?: Subscription;

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails?.username && this.userSessionDetails?.cloudProvider) {
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

  private loadFolderContents(folderPath: string): void {
    if (!this.email) {
      this.errorMessage = 'Please provide an email.';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.oneDriveContents = [];

    const url = folderPath
      ? `https://datakavach.com/onedrive/folder-contents?email=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`
      : `https://datakavach.com/onedrive/folders?email=${encodeURIComponent(this.email)}`;

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
        this.loading = false;
        if (this.oneDriveContents.length === 0) {
          this.errorMessage = `No items found in ${folderPath || 'root'}.`;
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to list contents. Please try again.';
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
  }
}