import { Component, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { logiApiResponce, resourcePermission } from 'src/app/models/api-resp.model';
import { LoginUserRequest } from 'src/app/models/login-request.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnDestroy {
  submitted = false;
  invalidMsg = '';
  model: LoginUserRequest;
  apiResp: logiApiResponce;
  frmValidate: FormGroup;
  private LoginUserSubscription?: Subscription;
  resourceNames: resourcePermission[] = [];

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.model = {
      username: '',
      password: '',
    };
    this.apiResp = {
      statusCode: '',
      message: '',
      jwtToken: '',
      username: '',
      resourcePermission: [],
      userType: 4, // Hardcoded for testing
      roleid: 1, // Hardcoded for testing
    };
    this.frmValidate = this.fv.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onLoginUser(): void {
    this.submitted = true;
    this.invalidMsg = '';
    if (this.frmValidate.valid) {
      this.model = Object.assign(this.model, this.frmValidate.value);
      console.log('Form submitted:', this.model);
      this.LoginUserSubscription = this.authService.loginUser(this.model).subscribe(
        (response) => {
          this.apiResp = Object.assign(this.apiResp, response);
          if (this.apiResp.statusCode === '200') {
            sessionStorage.setItem('ResourcesAccess', JSON.stringify(this.apiResp.resourcePermission));
            sessionStorage.setItem('UserDetails', JSON.stringify(this.apiResp));
            // Redirect to dynamic route instead of dashboard
            this.router.navigate(['dynamic']);
          } else {
            this.invalidMsg = 'Invalid username/Password';
          }
        },
        (error) => {
          console.error(error);
          this.invalidMsg = 'Invalid username/Password';
        }
      );
    } else {
      console.log('Form is invalid');
    }
  }

  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
  }

  ngOnDestroy(): void {
    this.LoginUserSubscription?.unsubscribe();
  }
}
