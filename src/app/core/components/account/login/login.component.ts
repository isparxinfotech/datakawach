import { Component, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { logiApiResponce, resourcePermission } from 'src/app/models/api-resp.model';
import { LoginUserRequest } from 'src/app/models/login-request.model';
import { AuthService } from 'src/app/services/auth.service';
import { AlertService } from 'src/app/services/alert.servive';
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnDestroy {
  submitted = false;
  invalidMsg = '';
  model: LoginUserRequest;
  apiResp: logiApiResponce;
  frmValidate: FormGroup;
  private LoginUserSubscription?: Subscription;
  resourceNames: resourcePermission[] = [];

  constructor(private alertService: AlertService, private authService: AuthService, private fv: FormBuilder, private router: Router)  {
    this.model = {
      username: '',
      password: ''
    };

    this.apiResp = {
      statusCode: '',
      message: '',
      jwtToken: '',
      username: '',
      resourcePermission: [],
      userType: 4, // Hardcoded for testing
      roleid: 1 // Hardcoded for testing
    };

    this.frmValidate = fv.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onLoginUser() {
    this.submitted = true;
    this.invalidMsg = '';
  
    if (this.frmValidate.valid) {
      this.model = Object.assign(this.model, this.frmValidate.value);
      this.LoginUserSubscription = this.authService.loginUser(this.model).subscribe(
        (response) => {
          this.apiResp = Object.assign(this.apiResp, response);
  
          if (this.apiResp.statusCode === '200') {
            this.alertService.showAlert('success', 'Login Successful!');
            sessionStorage.setItem("ResourcesAccess", JSON.stringify(this.apiResp.resourcePermission));
            sessionStorage.setItem("UserDetails", JSON.stringify(this.apiResp));
            this.router.navigate(['dashboard']);
          } else {
            this.alertService.showAlert('error', 'Invalid username/Password');
          }
        },
        (error) => {
          this.alertService.showAlert('error', 'Invalid username/Password');
        }
      );
    } else {
      this.alertService.showAlert('info', 'Please enter valid credentials.');
    }
  }

  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
  }

  navigateToRegister() {
    this.router.navigate(['/register']);
  }

  navigateToCorporateRegister() {
    this.router.navigate(['/registerCorporate']);
  }

  ngOnDestroy(): void {
    this.LoginUserSubscription?.unsubscribe();
  }
}
