import { Component } from '@angular/core';
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
export class UserAccountListComponent {
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
    this.userSessionDetails.userType = 5; // 3 is used to get Corp users
    this.PersonalInfoSubscription = this.superAdminService.getUsersList(this.userSessionDetails)
      .subscribe(
        (response) => {
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
          }));
          console.log("Mapped userInfo:", this.userInfo);
          if (this.userInfo.length > 0) {
            this.userInfo.reverse();
          }
        },
        (error) => {
          console.error("Error fetching user list:", error);
        }
      );
  }

  ngOnDestroy(): void {
    this.PersonalInfoSubscription?.unsubscribe();
  }
}