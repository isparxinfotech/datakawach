import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
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
export class CorporateDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
logout() {
throw new Error('Method not implemented.');
}
  @ViewChild('storagePieChart') pieChartCanvas!: ElementRef<HTMLCanvasElement>;
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

  ngAfterViewInit(): void {
    // Draw the pie chart after the view is initialized
    this.drawPieChart();
  }

  private drawPieChart(): void {
    if (!this.pieChartCanvas || this.storageCalculationFailed) {
      return;
    }

    const canvas = this.pieChartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return;
    }

    const percentage = this.getStoragePercentage();
    const usedAngle = (percentage / 100) * 2 * Math.PI;
    const remainingAngle = 2 * Math.PI - usedAngle;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Center and radius
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 10;

    // Draw used storage (dark blue)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, usedAngle);
    ctx.lineTo(centerX, centerY);
    ctx.fillStyle = '#1f1f1f'; // Match the .bg-blue color
    ctx.fill();

    // Draw remaining storage (light blue)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, usedAngle, 2 * Math.PI);
    ctx.lineTo(centerX, centerY);
    ctx.fillStyle = '#88c6fc'; // Match the previous progress background
    ctx.fill();

    // Add a stroke to separate segments
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
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
        this.drawPieChart(); // Redraw the pie chart when storage is updated
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
  getFileIconClass(item: { name: string; type: string }): string {
    if (item.type === 'folder') return 'fa fa-folder text-warning';
  
    const ext = item.name.split('.').pop()?.toLowerCase() || '';
    const iconMap: { [key: string]: string } = {
      'jpg': 'fa fa-file-image text-primary',
      'jpeg': 'fa fa-file-image text-primary',
      'png': 'fa fa-file-image text-primary',
      'gif': 'fa fa-file-image text-primary',
      'mp4': 'fa fa-file-video text-danger',
      'mov': 'fa fa-file-video text-danger',
      'avi': 'fa fa-file-video text-danger',
      'mp3': 'fa fa-file-audio text-success',
      'wav': 'fa fa-file-audio text-success',
      'pdf': 'fa fa-file-pdf text-danger',
      'doc': 'fa fa-file-word text-info',
      'docx': 'fa fa-file-word text-info',
      'xls': 'fa fa-file-excel text-success',
      'xlsx': 'fa fa-file-excel text-success',
      'zip': 'fa fa-file-archive text-secondary',
      'rar': 'fa fa-file-archive text-secondary',
      'psd': 'fa fa-file text-info',
      'ai': 'fa fa-file text-warning',
      'txt': 'fa fa-file-lines text-muted',
      'json': 'fa fa-file-code text-warning',
      'csv': 'fa fa-file-csv text-success'
    };
  
    return iconMap[ext] || 'fa fa-file text-secondary';
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