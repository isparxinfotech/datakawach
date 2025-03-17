import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service'; // Adjust path as needed
import { OneDriveService } from 'src/app/services/OneDriveService'; // Adjust path as needed
import { S3Service } from 'src/app/services/S3Service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model'; // Adjust path as needed

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  userSessionDetails: userSessionDetails | null | undefined;
  folders: any[] = [];
  buckets: any[] = [];
  folderSubscription?: Subscription;
  bucketSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private oneDriveService: OneDriveService,
    private s3Service: S3Service // Inject the new S3 service
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails && this.userSessionDetails.username) {
      this.loadFolders();
      this.loadBuckets();
    }
  }

  loadFolders(): void {
    this.folderSubscription = this.oneDriveService.getRootFolders(this.userSessionDetails!.username)
      .subscribe(
        (folders: any[]) => {
          this.folders = folders;
          console.log('OneDrive folders loaded:', this.folders);
        },
        (error: any) => {
          console.error('Error loading OneDrive folders:', error);
          this.folders = []; // Ensure folders is set even on error
        }
      );
  }

  loadBuckets(): void {
    this.bucketSubscription = this.s3Service.getS3Buckets()
      .subscribe(
        (buckets: any[]) => {
          this.buckets = buckets;
          console.log('S3 buckets loaded:', this.buckets);
        },
        (error: any) => {
          console.error('Error loading S3 buckets:', error);
          this.buckets = []; // Ensure buckets is set even on error
        }
      );
  }

  // Convert size from bytes to a human-readable format
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy(): void {
    if (this.folderSubscription) {
      this.folderSubscription.unsubscribe();
    }
    if (this.bucketSubscription) {
      this.bucketSubscription.unsubscribe();
    }
  }
}