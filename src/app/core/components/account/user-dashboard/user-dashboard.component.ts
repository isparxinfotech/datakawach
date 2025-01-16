import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { resourcePermission } from 'src/app/models/api-resp.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit {
  userName: string | undefined;
  resourceNames: resourcePermission[] = [];
  userSessionDetails: userSessionDetails | null | undefined;
  constructor(private authService: AuthService, private router: Router) {

  }
  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.resourceNames = this.authService.getResourcesAccess();
  }

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {

      return true;
    } else {
      // Redirect to the login page if not authenticated
    this.authService.logout();
      return false;
    }
  }
}
