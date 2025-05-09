import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { AuthService } from 'src/app/services/auth.service';
import { PersonalInfoRequest } from 'src/app/models/personal-info-request.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-user-edit',
  templateUrl: './user-edit.component.html',
  styleUrls: ['./user-edit.component.css']
})
export class UserEditComponent implements OnInit {
  user: PersonalInfoRequest | null = null;
  userSessionDetails: userSessionDetails | null | undefined;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private superAdminService: SuperAdminService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    const userId = this.route.snapshot.paramMap.get('userid');
    console.log('Route userId:', userId);
    if (userId && this.userSessionDetails) {
      this.loadUser(userId);
    } else {
      console.error('No userId or userSessionDetails found');
      this.router.navigate(['/useraccount']);
    }
  }

  loadUser(userId: string) {
    // Set userType to 5 as in UserAccountListComponent
    this.userSessionDetails!.userType = 5;
    console.log('Fetching users with session:', this.userSessionDetails);
    this.superAdminService.getUsersList(this.userSessionDetails!)
      .subscribe(
        (response) => {
          console.log("Raw response.userInfo:", response.userInfo);
          const userInfo = (response.userInfo as any[]).map(item => ({
            userid: String(item.userid) || '',
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
            ipAddress: item.ip_address || item.ipAddress || '',
            retentionNeeded: Number(item.retentionNeeded) || 0 // Add retentionNeeded, default to 0
          }));
          console.log("Mapped userInfo:", userInfo);
          this.user = userInfo.find(u => u.userid === userId) || null;
          if (!this.user) {
            console.error('User not found with ID:', userId);
            console.log('Available user IDs:', userInfo.map(u => u.userid));
            console.log('User types in response:', userInfo.map(u => u.userType));
            this.router.navigate(['/useraccount']);
          }
        },
        (error) => {
          console.error('Error fetching user list:', error);
          this.router.navigate(['/useraccount']);
        }
      );
  }

  saveUser() {
    if (!this.user || !this.userSessionDetails) return;

    const payload = {
      userid: this.user.userid,
      firstName: this.user.firstName,
      middleName: this.user.middleName,
      lastName: this.user.lastName,
      gender: this.user.gender,
      city: this.user.city,
      mobileNumber: this.user.mobileNumber,
      email: this.user.email,
      createdBy: this.userSessionDetails.username || '',
      dateOfBirth: this.user.dateOfBirth,
      address: this.user.address,
      pinCode: this.user.pinCode,
      corpoName: this.user.corpoName,
      branch: this.user.branch,
      landlineNumber: this.user.landlineNumber,
      userType: this.user.userType,
      retentionNeeded: this.user.retentionNeeded // Include retentionNeeded
    };

    this.superAdminService.updateUser(this.user.email, payload).subscribe(
      (response) => {
        console.log('User updated successfully:', response);
        this.router.navigate(['/useraccount']);
      },
      (error) => {
        console.error('Error updating user:', error);
      }
    );
  }

  cancel() {
    this.router.navigate(['/useraccount']);
  }
}