import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-corporate-dashboard',
  templateUrl: './corporate-dashboard.component.html',
  styleUrls: ['./corporate-dashboard.component.css']
})
export class CorporateDashboardComponent implements OnInit, OnDestroy {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  cloudProvider: string = '';
  oneDriveContents: { name: string, id: string, size: number, type: string, downloadUrl?: string }[] = [];
  currentPath: string = '';
  pathHistory: string[] = [];
  loading: boolean = false;
  errorMessage: string = '';
  userCount: number = 0;
  totalStorageUsed: number = 0;
  totalStorageLimit: number = 1 * 1024 * 1024 * 1024 * 1024; // 1TB
  storageCalculationFailed: boolean = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private superAdminService: SuperAdminService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails?.username && this.userSessionDetails?.cloudProvider) {
      this.email = this.userSessionDetails.username;
      this.cloudProvider = this.userSessionDetails.cloudProvider.toLowerCase();
      if (this.cloudProvider === 'onedrive') {
        this.fetchUserCount();
        this.calculateTotalStorage();
        this.listRootFolders();
      } else {
        this.errorMessage = 'Only OneDrive is supported for corporate dashboard.';
      }
    } else {
      this.errorMessage = 'User session details are incomplete. Please log in again.';
    }
  }

  private fetchUserCount(): void {
    this.loading = true;
    if (!this.userSessionDetails) {
      this.errorMessage = 'User session details are missing.';
      this.loading = false;
      return;
    }
    this.userSessionDetails.userType = 5;
    this.subscriptions.push(
      this.superAdminService.getUsersList(this.userSessionDetails).subscribe({
        next: (response) => {
          const userInfo = (response.userInfo as any[]).map(item => ({
            userid: item.userid || '',
            firstName: item.firstName || '',
            middleName: item.middleName || '',
            lastName: item.lastName || '',
            gender: item.gender || '',
            dateOfBirth: item.dateOfBirth ? new Date(item.dateOfBirth) : null,
            address: item.address || '',
            city: item.city || '',
            pinCode: item.pinCode || '',
            mobileNumber: item.mobileNumber || '',
            email: item.email || '',
            corpoName: item.corpoName || '',
            branch: item.branch || '',
            landlineNumber: item.landlineNumber || '',
            userType: Number(item.userType) || 0,
          }));
          this.userCount = userInfo.length;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Failed to fetch user count.';
          this.loading = false;
        }
      })
    );
  }

  calculateTotalStorage(): void {
    this.totalStorageUsed = 0;
    this.storageCalculationFailed = false;
    this.loading = true;

    this.fetchFolderContentsRecursively('').subscribe({
      next: (totalSize: number) => {
        this.totalStorageUsed = totalSize;
        this.loading = false;
      },
      error: (err) => {
        console.error('Storage calculation error:', err);
        this.errorMessage = err.message || 'Failed to calculate total storage. Please try again later.';
        this.storageCalculationFailed = true;
        this.loading = false;
      }
    });
  }

  private fetchFolderContentsRecursively(folderPath: string): Observable<number> {
    return new Observable<number>((observer) => {
      let totalSize = 0;
      const url = folderPath
        ? `https://datakavach.com/onedrive/folder-contents?email=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`
        : `https://datakavach.com/onedrive/folders?email=${encodeURIComponent(this.email)}`;

      this.subscriptions.push(
        this.http.get<any[]>(url).subscribe({
          next: (response) => {
            if (!response || !Array.isArray(response)) {
              console.warn(`Empty or invalid response from ${url}:`, response);
              observer.next(totalSize);
              observer.complete();
              return;
            }

            const contents = response
              .map(item => ({
                name: item.name || 'Unknown',
                id: item.id || 'N/A',
                size: item.size !== undefined ? Number(item.size) : 0,
                type: item.type || 'folder',
                downloadUrl: item.downloadUrl
              }))
              .filter(item => item.size >= 0);

            totalSize += contents.reduce((sum, item) => sum + item.size, 0);

            const folderObservables = contents
              .filter(item => item.type === 'folder')
              .map(item => {
                const newPath = folderPath ? `${folderPath}/${item.name}` : item.name;
                return this.fetchFolderContentsRecursively(newPath);
              });

            if (folderObservables.length > 0) {
              forkJoin(folderObservables).subscribe({
                next: (subfolderSizes: number[]) => {
                  totalSize += subfolderSizes.reduce((sum, size) => sum + size, 0);
                  observer.next(totalSize);
                  observer.complete();
                },
                error: (err) => {
                  console.error(`Error fetching subfolder contents for ${folderPath}:`, err);
                  observer.next(totalSize);
                  observer.complete();
                }
              });
            } else {
              observer.next(totalSize);
              observer.complete();
            }
          },
          error: (err) => {
            console.error(`HTTP error for ${url}:`, err);
            observer.next(totalSize);
            observer.complete();
          }
        })
      );
    });
  }

  toggleSidebar(): void {
    const sidebar = document.querySelector('.sidebar-wrapper');
    if (sidebar) {
      sidebar.classList.toggle('active');
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

    this.subscriptions.push(
      this.http.get<any[]>(url).subscribe({
        next: (response) => {
          if (!response || !Array.isArray(response)) {
            this.errorMessage = 'No items found in the current folder.';
            this.loading = false;
            return;
          }
          this.oneDriveContents = response
            .map(item => ({
              name: item.name || 'Unknown',
              id: item.id || 'N/A',
              size: item.size !== undefined ? Number(item.size) : 0,
              type: item.type || 'folder',
              downloadUrl: item.downloadUrl
            }))
            .filter(item => item.size >= 0);

          this.calculateTotalStorage();
          this.loading = false;
          if (this.oneDriveContents.length === 0) {
            this.errorMessage = `No items found in ${folderPath || 'root'}.`;
          }
        },
        error: (err) => {
          console.error('Error loading folder contents:', err);
          this.loading = false;
          this.errorMessage = err.error?.message || 'Failed to list contents. Please try again.';
        }
      })
    );
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getStoragePercentage(): number {
    if (this.totalStorageLimit === 0 || this.storageCalculationFailed) {
      return 0;
    }
    return Math.min((this.totalStorageUsed / this.totalStorageLimit) * 100, 100);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}