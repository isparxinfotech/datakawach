import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RegisterUserComponent } from './core/components/account/register-user/register-user.component';
import { HomeComponent } from './core/components/home/home.component';
import { LoginComponent } from './core/components/account/login/login.component';
import { UserDashboardComponent } from './core/components/account/user-dashboard/user-dashboard.component';
import { AuthGuard } from './services/auth.gaurd';
import { PersonalInformationComponent } from './core/components/account/personal-information/personal-information.component';
import { CreateCorporateAccountComponent } from './core/components/account/create-corporate-account/create-corporate-account.component';
import { LogOutComponent } from './core/components/account/log-out/log-out.component';
import { CorporateAccountListComponent } from './core/components/account/corporate-account-list/corporate-account-list.component';
import { CreateUserAccountComponent } from './core/components/account/create-user-account/create-user-account.component';
import { UserAccountListComponent } from './core/components/account/user-account-list/user-account-list.component';
import { UploadDocumentComponent } from './core/components/account/upload-document/upload-document.component';
import { LabDetailsComponent } from './core/components/account/lab-details/lab-details.component';
import { UploadToCloudComponent } from './core/components/account/upload-to-cloud/upload-to-cloud.component';
import { DynamicMenusComponent } from './core/components/account/dynamic-menus/dynamic-menus.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
  path: 'login',
  component: LoginComponent
  },
  {
    path: 'dynamic',
    component: DynamicMenusComponent,
    canActivate: [AuthGuard] // Ensures the user is authenticated before accessing dynamic
  },
  {
    path: 'admin-dashboard',
    component: AdminDashboardComponent,
  },
  {
    path: 'register',
    component: RegisterUserComponent
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [AuthGuard] // Protect home route with AuthGuard
  },
  {
    path: 'logout',
    component: LogOutComponent
  },
  {
    path: 'dashboard',
    component: UserDashboardComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'personalinformation',
    component: PersonalInformationComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'corporateaccount',
    component: CorporateAccountListComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'useraccount',
    component: UserAccountListComponent,
    // canActivate: [AuthGuard]
  },
  {
    path: 'createuseraccount',
    component: CreateUserAccountComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'createcorporateaccount',
    component: CreateCorporateAccountComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'uploaddoc',
    component: UploadDocumentComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'labdetails',
    component: LabDetailsComponent,
    canActivate: [AuthGuard]
  },
  // {
  //   path: 'healthScore',
  //   component: HealthScoreComponent,
  //   canActivate: [AuthGuard]
  // },
  {
    path: 'uploadtocloud',
    component: UploadToCloudComponent,
     canActivate: [AuthGuard]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
