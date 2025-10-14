import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
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
export class LoginComponent implements OnInit, OnDestroy, AfterViewInit {
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
  showMfaNotification = false;

  // Timer properties
  qrCodeExpirySeconds = 60;
  timeLeft = 60;
  isQrExpired = false;
  qrCodeTimer: any;

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

  showPassword: boolean = false;

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  ngOnInit(): void {
    // Add event listener for keydown to block dev tools shortcuts
    document.addEventListener('keydown', this.disableDevTools.bind(this));
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
    this.isQrExpired = false;

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
          this.showMfaNotification = true;
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
        this.invalidMsg = error.error?.message || 'Login failed';
        this.alertService.showAlert('error', this.invalidMsg);
        this.loading = false;
        this.qrCodeLoading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  retryQrCode() {
    this.isQrExpired = false;
    this.timeLeft = this.qrCodeExpirySeconds;
    this.qrCodeError = false;
    this.qrCodeLoading = true;
    this.cdr.detectChanges();
    this.onLoginUser(); // or regenerate QR logic if different
  }

  onQrCodeLoadError() {
    if (this.qrCodeUrl) {
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
      this.startQrTimer();
    };

    img.onerror = () => {
      this.onQrCodeLoadError();
    };
  }

  private startQrTimer() {
    this.timeLeft = this.qrCodeExpirySeconds;
    this.isQrExpired = false;
    if (this.qrCodeTimer) clearInterval(this.qrCodeTimer);

    this.qrCodeTimer = setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
      } else {
        clearInterval(this.qrCodeTimer);
        this.isQrExpired = true;
        this.qrCodeUrl = '';
        this.cdr.detectChanges();
      }
    }, 1000);
  }

  private handleSuccessfulLogin(response: userSessionDetails) {
    this.authService.saveUserDetails(response);
    const userType = response.userType || 5;
    if (userType === 3) {
      this.router.navigate(['/corporatedashboard']);
    } else if (userType === 1) {
      this.router.navigate(['/admindashboard']);
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
    this.showMfaNotification = false;
    this.isQrExpired = false;
    clearInterval(this.qrCodeTimer);
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

  disableRightClick(event: MouseEvent): void {
    event.preventDefault();
  }

  disableDevTools(event: KeyboardEvent): void {
    // Block F12
    if (event.key === 'F12') {
      event.preventDefault();
      return;
    }

    // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'i' || event.key === 'J' || event.key === 'j')) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && (event.key === 'U' || event.key === 'u')) {
      event.preventDefault();
      return;
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    clearInterval(this.qrCodeTimer);
    document.removeEventListener('keydown', this.disableDevTools.bind(this));
  }
}