import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { AuthService } from 'src/app/services/auth.service';
import { PersonalInfoRequest } from 'src/app/models/personal-info-request.model';

@Component({
  selector: 'app-user-account-list',
  templateUrl: './user-account-list.component.html',
  styleUrls: ['./user-account-list.component.css']
})
export class UserAccountListComponent implements OnInit, OnDestroy {
  PersonalInfoSubscription?: Subscription;
  userSessionDetails: userSessionDetails | null | undefined;
  userInfo: PersonalInfoRequest[] = [];

  constructor(
    private superAdminService: SuperAdminService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails) {
      this.getUsersList();
    }
  }

  getUsersList() {
    if (!this.userSessionDetails) {
      return;
    }
    this.userSessionDetails.userType = 5; // 5 is used for super admin
    this.PersonalInfoSubscription = this.superAdminService.getUsersList(this.userSessionDetails)
      .subscribe({
        next: (response) => {
          console.log("User list fetched:", response);
          this.userInfo = (response.userInfo as any[]).map(item => ({
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
            retentionNeeded: Number(item.retentionNeeded) || 0,
            isAuthenticated: Number(item.isAuthenticated) || 0 // Map isAuthenticated
          }));
          console.log("Mapped userInfo:", this.userInfo);
          if (this.userInfo.length > 0) {
            this.userInfo.reverse();
          }
        },
        error: (error) => {
          console.error("Error fetching user list:", error);
          alert('Error fetching user list: ' + (error.error?.message || error.message));
        }
      });
  }

  toggleMfaStatus(email: string, currentStatus: number) {
    if (!this.userSessionDetails) {
      alert('User session not found. Please log in again.');
      return;
    }
    const newStatus = currentStatus === 1 ? 0 : 1;
    this.superAdminService.updateIsAuthenticated(email, newStatus, this.userSessionDetails)
      .subscribe({
        next: (response) => {
          console.log("MFA status updated:", response);
          alert(response.message || 'MFA status updated successfully!');
          this.getUsersList(); // Refresh the user list
        },
        error: (error) => {
          console.error("Error updating MFA status:", error);
          alert('Error updating MFA status: ' + (error.error?.message || error.message));
        }
      });
  }

  onFileChange($event: Event) {
    throw new Error('Method not implemented.');
  }

  exportToExcel() {
    throw new Error('Method not implemented.');
  }

  ngOnDestroy(): void {
    this.PersonalInfoSubscription?.unsubscribe();
  }
}