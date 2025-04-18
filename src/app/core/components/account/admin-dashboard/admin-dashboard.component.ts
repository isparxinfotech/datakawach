import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  adminSessionDetails: userSessionDetails | null | undefined;
  metrics: { totalCorporates: number; totalUsers: number; totalStorage: number } = {
    totalCorporates: 0,
    totalUsers: 0,
    totalStorage: 0
  };
  loading: boolean = false;
  errorMessage: string = '';
  subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private superAdminService: SuperAdminService
  ) {}

  ngOnInit(): void {
    this.adminSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.adminSessionDetails) {
      this.loadMetrics();
    } else {
      this.errorMessage = 'User session details not found. Please log in again.';
      this.loading = false;
    }
  }

  loadMetrics(): void {
    this.loading = true;
    this.errorMessage = '';

    if (!this.adminSessionDetails) {
      this.errorMessage = 'User session details not found.';
      this.loading = false;
      return;
    }

    // Fetch corporate count (userType = 3)
    const corporateSession: userSessionDetails = {
      statusCode: this.adminSessionDetails.statusCode || '200',
      message: this.adminSessionDetails.message,
      jwtToken: this.adminSessionDetails.jwtToken || '',
      username: this.adminSessionDetails.username || '',
      resourcePermission: this.adminSessionDetails.resourcePermission || [],
      userType: 3, // Override for corporates
      roleid: this.adminSessionDetails.roleid || 0,
      cloudProvider: this.adminSessionDetails.cloudProvider
    };
    this.subscriptions.push(
      this.superAdminService.getUsersList(corporateSession).subscribe({
        next: (response) => {
          this.metrics.totalCorporates = Array.isArray(response.userInfo) ? response.userInfo.length : 0;
          console.log('Corporate count:', this.metrics.totalCorporates);
          this.checkLoadingComplete();
        },
        error: (err) => {
          this.errorMessage = 'Failed to load corporate count.';
          console.error('Error fetching corporates:', err);
          this.checkLoadingComplete();
        }
      })
    );

    // Fetch user count (userType = 5)
    const userSession: userSessionDetails = {
      statusCode: this.adminSessionDetails.statusCode || '200',
      message: this.adminSessionDetails.message,
      jwtToken: this.adminSessionDetails.jwtToken || '',
      username: this.adminSessionDetails.username || '',
      resourcePermission: this.adminSessionDetails.resourcePermission || [],
      userType: 5, // Override for users
      roleid: this.adminSessionDetails.roleid || 0,
      cloudProvider: this.adminSessionDetails.cloudProvider
    };
    this.subscriptions.push(
      this.superAdminService.getUsersList(userSession).subscribe({
        next: (response) => {
          this.metrics.totalUsers = Array.isArray(response.userInfo) ? response.userInfo.length : 0;
          console.log('User count:', this.metrics.totalUsers);
          this.checkLoadingComplete();
        },
        error: (err) => {
          this.errorMessage = 'Failed to load user count.';
          console.error('Error fetching users:', err);
          this.checkLoadingComplete();
        }
      })
    );

    // Placeholder for data storage (replace with actual service if available)
    this.metrics.totalStorage = 536870912000; // Example: 500 GB in bytes
    this.checkLoadingComplete();
  }

  // Helper to check if all data is loaded
  private checkLoadingComplete(): void {
    this.loading = false;
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}