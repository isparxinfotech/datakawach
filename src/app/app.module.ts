import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { FooterComponent } from './core/components/footer/footer.component';
import { RegisterUserComponent } from './core/components/account/register-user/register-user.component';
import { LoginComponent } from './core/components/account/login/login.component';
import { HomeComponent } from './core/components/home/home.component';
import { FormsModule,ReactiveFormsModule } from '@angular/forms';
import {HttpClientModule} from '@angular/common/http'
import { UserDashboardComponent } from './core/components/account/user-dashboard/user-dashboard.component';
import { PersonalInformationComponent } from './core/components/account/personal-information/personal-information.component';
import {DatePipe,CommonModule} from '@angular/common';
import { CreateCorporateAccountComponent } from './core/components/account/create-corporate-account/create-corporate-account.component';
import { LogOutComponent } from './core/components/account/log-out/log-out.component';
import { DynamicMenusComponent } from './core/components/account/dynamic-menus/dynamic-menus.component';
import { CorporateAccountListComponent } from './core/components/account/corporate-account-list/corporate-account-list.component';
import { CreateUserAccountComponent } from './core/components/account/create-user-account/create-user-account.component';
import { UserAccountListComponent } from './core/components/account/user-account-list/user-account-list.component';
import { UploadDocumentComponent } from './core/components/account/upload-document/upload-document.component';
import { LabDetailsComponent } from './core/components/account/lab-details/lab-details.component';
import { HealthScoreComponent } from './core/components/account/health-score/health-score.component';
import { UploadToCloudComponent } from './core/components/account/upload-to-cloud/upload-to-cloud.component';
@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    FooterComponent,
    RegisterUserComponent,
    LoginComponent,
    HomeComponent,
    UserDashboardComponent,
    PersonalInformationComponent,
    CreateCorporateAccountComponent,
    CreateUserAccountComponent,
    LogOutComponent,
    DynamicMenusComponent,
    CorporateAccountListComponent,
    UserAccountListComponent,
    UploadDocumentComponent,
    LabDetailsComponent,
    HealthScoreComponent,
    UploadToCloudComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    ReactiveFormsModule,
    CommonModule,
    DatePipe
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
