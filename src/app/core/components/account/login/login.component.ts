import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { AlertService } from 'src/app/services/alert.servive';
import { userSessionDetails } from 'src/app/models/api-resp.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnDestroy {
  frmValidate: FormGroup;
  otpForm: FormGroup;
  showOtp = false;
  submitted = false;
  otpSubmitted = false;
  invalidMsg = '';
  currentUsername = '';
  private subscriptions: Subscription[] = [];
  hover: boolean = false;
  isDarkMode: boolean = false;

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private fb: FormBuilder,
    private router: Router
  ) {
    // Initialize dark mode based on system preference or saved setting
    this.isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', this.isDarkMode);

    this.frmValidate = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  get f() {
    return this.frmValidate.controls;
  }

  get otpF() {
    return this.otpForm.controls;
  }

  onLoginUser() {
    this.submitted = true;
    this.invalidMsg = '';

    if (this.frmValidate.invalid) {
      this.alertService.showAlert('info', 'Please enter valid credentials');
      return;
    }

    const credentials = {
      username: this.frmValidate.value.username,
      password: this.frmValidate.value.password
    };

    const sub = this.authService.loginUser(credentials).subscribe({
      next: (response: userSessionDetails) => {
        if (response.statusCode === '202') {
          this.currentUsername = credentials.username;
          this.showOtp = true;
          this.requestOtp(credentials.username, credentials.password);
        } else if (response.statusCode === '200') {
          this.handleSuccessfulLogin(response);
        } else {
          this.invalidMsg = response.message || 'Login failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
      },
      error: (error) => {
        this.invalidMsg = error.error?.message || 'Login failed';
        this.alertService.showAlert('error', this.invalidMsg);
      }
    });
    this.subscriptions.push(sub);
  }

  onValidateOtp() {
    this.otpSubmitted = true;
    if (this.otpForm.invalid) {
      this.alertService.showAlert('info', 'Please enter a valid 6-digit OTP');
      return;
    }

    const sub = this.authService.validateOtp(
      this.currentUsername,
      this.otpForm.value.otp
    ).subscribe({
      next: (response: userSessionDetails) => {
        if (response.statusCode === '200') {
          this.handleSuccessfulLogin(response);
        } else {
          this.invalidMsg = response.message || 'OTP validation failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
      },
      error: (error) => {
        this.invalidMsg = error.error?.message || 'OTP validation failed';
        this.alertService.showAlert('error', this.invalidMsg);
      }
    });
    this.subscriptions.push(sub);
  }

  resendOtp() {
    this.requestOtp(this.currentUsername, this.frmValidate.value.password);
  }

  private requestOtp(username: string, password: string) {
    const sub = this.authService.requestOtp(username, password).subscribe({
      next: () => {
        this.alertService.showAlert('success', 'OTP sent successfully');
      },
      error: (error) => {
        this.alertService.showAlert('error', error.error || 'Failed to send OTP');
      }
    });
    this.subscriptions.push(sub);
  }

  private handleSuccessfulLogin(response: userSessionDetails) {
    this.authService.saveUserDetails(response);
    this.router.navigate(['/dashboard']);
  }

  goBackToLogin() {
    this.showOtp = false;
    this.otpSubmitted = false;
    this.otpForm.reset();
    this.invalidMsg = '';
  }

  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
    this.otpForm.reset();
    this.showOtp = false;
    this.invalidMsg = '';
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    // Optional: Save preference to localStorage
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}