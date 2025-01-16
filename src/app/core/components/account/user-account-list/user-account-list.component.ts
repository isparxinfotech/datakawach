import { ChangeDetectorRef, Component } from '@angular/core';
import { Subscription } from 'rxjs';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { AuthService } from 'src/app/services/auth.service';
import { GetPersonalInfoRequest, PersonalInfoRequest } from 'src/app/models/personal-info-request.model';

@Component({
  selector: 'app-user-account-list',
  templateUrl: './user-account-list.component.html',
  styleUrls: ['./user-account-list.component.css']
})
export class UserAccountListComponent {
  PersonalInfoSubscription?: Subscription;
  userSessionDetails: userSessionDetails | null | undefined;
  getPersonalInfoRequest: GetPersonalInfoRequest[] = [];
  userInfo: PersonalInfoRequest[] = [];

  constructor(private SuperAdminService: SuperAdminService, private AuthService: AuthService) {
   }

  ngOnInit(): void {
  this.userSessionDetails = this.AuthService.getLoggedInUserDetails();
   if (this.userSessionDetails) {
        this.getUsersList();
      }
  }

  getUsersList() {
    if (!this.userSessionDetails) {
      return;
    }
    this.userSessionDetails.userType = 5; // 3 i used to get Corps users
    this.PersonalInfoSubscription = this.SuperAdminService.getUsersList(this.userSessionDetails)
      .subscribe(
        (response) => {
          console.log("Corp list");
          this.getPersonalInfoRequest = Object.assign(this.getPersonalInfoRequest, response.userInfo);
          console.log(this.getPersonalInfoRequest);
          if (this.getPersonalInfoRequest.length > 0) {
            this.userInfo = this.getPersonalInfoRequest;
            this.userInfo.reverse();
          }
        },
        (error) => {
          console.log(error);
        }
      );
  }
}
