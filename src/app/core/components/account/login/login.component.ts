import { Component, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { AlertService } from 'src/app/services/AlertService';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnDestroy, AfterViewInit {
  frmValidate: FormGroup;
  otpForm: FormGroup;
  showOtp = false;
  submitted = false;
  otpSubmitted = false;
  invalidMsg = '';
  qrCodeUrl = '';
  qrCodeError = false;
  loading = false;
  qrCodeLoading = false;
  showMfaNotification = false; // New property to control MFA notification popup

  private subscriptions: Subscription[] = [];
  private currentUsername: string = '';

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private fb: FormBuilder,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.frmValidate = this.fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  ngAfterViewInit() {
    if (this.showOtp && this.qrCodeUrl) {
      this.checkQrCode();
    }
  }

  onLoginUser() {
    this.submitted = true;
    this.invalidMsg = '';
    this.loading = true;
    this.qrCodeError = false;
    this.qrCodeLoading = false;

    if (this.frmValidate.invalid) {
      this.alertService.showAlert('info', 'Please enter valid credentials');
      this.loading = false;
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
          this.qrCodeUrl = response.qrCodeUrl || '';
          if (!this.qrCodeUrl) {
            this.alertService.showAlert('error', 'No QR code provided for MFA setup. Please try again.');
            this.loading = false;
            return;
          }
          this.showOtp = true;
          this.qrCodeLoading = true;
          this.showMfaNotification = true; // Show MFA notification popup for first-time setup
          this.cdr.detectChanges();
          this.checkQrCode();
          this.alertService.showAlert('success', 'Please scan the QR code with Google Authenticator to set up MFA.');
        } else if (response.statusCode === '203') {
          this.currentUsername = credentials.username;
          this.qrCodeUrl = '';
          this.showOtp = true;
          this.qrCodeLoading = false;
          this.qrCodeError = false;
          this.cdr.detectChanges();
          this.alertService.showAlert('info', 'Please enter the 6-digit code from your authenticator app.');
        } else if (response.statusCode === '200') {
          this.handleSuccessfulLogin(response);
        } else if (response.statusCode === '500') {
          this.invalidMsg = response.message || 'Server error during MFA setup';
          this.alertService.showAlert('error', this.invalidMsg);
        } else {
          this.invalidMsg = response.message || 'Login failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Login error:', error);
        this.invalidMsg = error.error?.message || 'Login failed';
        this.alertService.showAlert('error', this.invalidMsg);
        this.loading = false;
        this.qrCodeLoading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  retryQrCode() {
    if (!this.qrCodeUrl) {
      this.alertService.showAlert('info', 'No QR code to retry. Please log in again.');
      return;
    }
    this.qrCodeError = false;
    this.qrCodeLoading = true;
    this.cdr.detectChanges();
    this.onLoginUser();
  }

  onQrCodeLoadError() {
    if (this.qrCodeUrl) {
      console.error('QR code image failed to load:', this.qrCodeUrl);
      this.alertService.showAlert('error', 'Failed to load QR code image. Please try again.');
      this.qrCodeError = true;
      this.qrCodeLoading = false;
      this.cdr.detectChanges();
    }
  }

  onValidateOtp() {
    this.otpSubmitted = true;
    this.loading = true;

    if (this.otpForm.invalid) {
      this.alertService.showAlert('info', 'Please enter a valid 6-digit MFA code');
      this.loading = false;
      return;
    }

    const otp = this.otpForm.value.otp.replace(/\s/g, '');
    if (!/^\d{6}$/.test(otp)) {
      this.alertService.showAlert('info', 'MFA code must be a 6-digit number');
      this.loading = false;
      return;
    }

    const sub = this.authService.validateMfaCode(this.currentUsername, otp).subscribe({
      next: (response: userSessionDetails) => {
        if (response.statusCode === '200') {
          this.handleSuccessfulLogin(response);
        } else {
          this.invalidMsg = response.message || 'MFA validation failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('MFA validation error:', error);
        this.invalidMsg = error.error?.message || 'MFA validation failed';
        this.alertService.showAlert('error', this.invalidMsg);
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  private checkQrCode() {
    if (!this.qrCodeUrl) {
      this.qrCodeLoading = false;
      return;
    }
    const img = new Image();
    img.src = this.qrCodeUrl;
    img.onload = () => {
      this.qrCodeLoading = false;
      this.cdr.detectChanges();
    };
    img.onerror = () => {
      this.onQrCodeLoadError();
    };
  }

  private handleSuccessfulLogin(response: userSessionDetails) {
    this.authService.saveUserDetails(response);
    const userType = response.userType || 5;
    if (userType === 3) {
      this.router.navigate(['/corporatedashboard']);
    } else if (userType === 1) {
      this.router.navigate(['/admindashboard']);
    } else if (userType === 5) {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  goBackToLogin() {
    this.showOtp = false;
    this.otpSubmitted = false;
    this.otpForm.reset();
    this.qrCodeUrl = '';
    this.currentUsername = '';
    this.invalidMsg = '';
    this.qrCodeError = false;
    this.qrCodeLoading = false;
    this.showMfaNotification = false; // Hide MFA notification when going back
  }

  closeMfaNotification(event?: MouseEvent) {
    if (event) {
      const target = event.target as HTMLElement;
      if (target.classList.contains('modal') && !target.classList.contains('modal-content')) {
        this.showMfaNotification = false;
        this.cdr.detectChanges();
      }
    } else {
      this.showMfaNotification = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}