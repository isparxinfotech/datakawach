import { Component, OnInit, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-create-corporate-account',
  templateUrl: './create-corporate-account.component.html',
  styleUrls: ['./create-corporate-account.component.css']
})
export class CreateCorporateAccountComponent implements OnInit, OnDestroy {
  submitted = false;
  registerUserRequest!: RegisterUserRequest;
  userSessionDetails: userSessionDetails | null | undefined;
  frmValidate: FormGroup;
  registerUserRequestSubscription?: Subscription;
  modalDisplayStyle = 'none';
  userMessage = '';
  selectedCloudProvider: string = '';

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.frmValidate = this.fv.group({
      firstName: ['none'], // Default to satisfy @NotBlank and @Size(min=3, max=50)
      middleName: ['none'], // Default to satisfy @NotBlank and @Size(min=3, max=50)
      lastName: ['none'], // Default to satisfy @NotBlank and @Size(min=3, max=50)
      gender: ['none'], // Default to satisfy @NotBlank and @Size(min=3, max=20)
      address: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
      pinCode: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(20), Validators.pattern('^[0-9]+$')]],
      email: ['', [Validators.required, Validators.pattern('^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$'), Validators.maxLength(50)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.pattern('^(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]}{8,}$')]],
      confirmPassword: ['', [Validators.required]],
      corpoName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      branch: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      landlineNumber: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(15), Validators.pattern('^[0-9]+$')]],
      userType: [3], // Corporate user type
      createdBy: [''],
      folderName: ['', [Validators.maxLength(255), Validators.pattern('^[^<>:\"/\\\\|?*\\x00-\\x1F@ ]+$')]],
      retentionNeeded: ['', [Validators.required]],
      cloudProvider: ['', [Validators.required]],
      oneDriveUserId: ['', [Validators.maxLength(250)]],
      onedriveUsername: ['', [Validators.maxLength(250)]],
      onedrivePassword: ['', [Validators.maxLength(250)]],
      onedriveTenantId: ['', [Validators.maxLength(250)]],
      onedriveClientId: ['', [Validators.maxLength(250)]],
      clientSecret: ['', [Validators.maxLength(250)]],
      awsAccessKey: ['', [Validators.maxLength(250)]],
      awsSecretKey: ['', [Validators.maxLength(250)]],
      awsRegion: ['', [Validators.maxLength(50)]]
    }, {
      validators: [this.passwordMatchValidator]
    });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.frmValidate.patchValue({
      createdBy: this.userSessionDetails?.username,
      firstName: 'none',
      middleName: 'none',
      lastName: 'none',
      gender: 'none',
      retentionNeeded: ''
    });
  }

  ngOnDestroy(): void {
    this.registerUserRequestSubscription?.unsubscribe();
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onCloudProviderChange(event: Event) {
    this.selectedCloudProvider = (event.target as HTMLSelectElement).value;
    this.updateFormValidators();
    this.updateFolderName();
  }

  updateFormValidators() {
    if (this.selectedCloudProvider === 'onedrive') {
      this.frmValidate.get('oneDriveUserId')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('onedriveUsername')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('onedrivePassword')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('onedriveTenantId')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('onedriveClientId')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('clientSecret')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('awsAccessKey')?.clearValidators();
      this.frmValidate.get('awsSecretKey')?.clearValidators();
      this.frmValidate.get('awsRegion')?.clearValidators();
      this.frmValidate.get('folderName')?.setValidators([Validators.required, Validators.maxLength(255), Validators.pattern('^[^<>:\"/\\\\|?*\\x00-\\x1F@ ]+$')]);
    } else if (this.selectedCloudProvider === 'aws') {
      this.frmValidate.get('awsAccessKey')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('awsSecretKey')?.setValidators([Validators.required, Validators.maxLength(250)]);
      this.frmValidate.get('awsRegion')?.setValidators([Validators.required, Validators.maxLength(50)]);
      this.frmValidate.get('oneDriveUserId')?.clearValidators();
      this.frmValidate.get('onedriveUsername')?.clearValidators();
      this.frmValidate.get('onedrivePassword')?.clearValidators();
      this.frmValidate.get('onedriveTenantId')?.clearValidators();
      this.frmValidate.get('onedriveClientId')?.clearValidators();
      this.frmValidate.get('clientSecret')?.clearValidators();
      this.frmValidate.get('folderName')?.clearValidators();
    } else {
      this.frmValidate.get('oneDriveUserId')?.clearValidators();
      this.frmValidate.get('onedriveUsername')?.clearValidators();
      this.frmValidate.get('onedrivePassword')?.clearValidators();
      this.frmValidate.get('onedriveTenantId')?.clearValidators();
      this.frmValidate.get('onedriveClientId')?.clearValidators();
      this.frmValidate.get('clientSecret')?.clearValidators();
      this.frmValidate.get('awsAccessKey')?.clearValidators();
      this.frmValidate.get('awsSecretKey')?.clearValidators();
      this.frmValidate.get('awsRegion')?.clearValidators();
      this.frmValidate.get('folderName')?.clearValidators();
    }

    Object.keys(this.frmValidate.controls).forEach(key => {
      this.frmValidate.get(key)?.updateValueAndValidity();
    });
  }

  updateFolderName() {
    if (this.selectedCloudProvider === 'onedrive') {
      const email = this.frmValidate.get('email')?.value;
      const folderName = email && email.includes('@') ? email.split('@')[0] : '';
      this.frmValidate.patchValue({ folderName });
    } else {
      this.frmValidate.patchValue({ folderName: '' });
    }
  }

  onCreateCorporateAccount() {
    this.submitted = true;

    if (this.frmValidate.invalid) {
      console.warn('Form is invalid', this.frmValidate.errors, this.frmValidate.value);
      this.userMessage = 'Please correct the errors in the form.';
      this.modalDisplayStyle = 'block';
      return;
    }

    this.registerUserRequest = this.frmValidate.value as RegisterUserRequest;
    this.registerUserRequest.userType = 3; // Corporate user type
    this.registerUserRequest.retentionNeeded = parseInt(this.frmValidate.get('retentionNeeded')?.value, 10); // Ensure retentionNeeded is a number

    // Sanitize sensitive fields for logging
    const logRequest = { ...this.registerUserRequest, password: '***', onedrivePassword: '***', clientSecret: '***', awsSecretKey: '***' };
    console.log('Submitting form:', logRequest);

    this.registerUserRequestSubscription = this.authService.registerUser(this.registerUserRequest)
      .subscribe({
        next: (response) => {
          console.log('Success:', response);
          this.userMessage = '';
          this.modalDisplayStyle = 'block';
          this.onReset();
        },
        error: (error) => {
          console.error('Error:', error);
          this.modalDisplayStyle = 'block';
          this.userMessage = error.error?.message || 'Failed to create account. Please check your inputs or try again later.';
        }
      });
  }

  onReset(): void {
    this.submitted = false;
    this.selectedCloudProvider = '';
    this.userMessage = '';
    this.modalDisplayStyle = 'none';
    this.frmValidate.reset({
      firstName: 'none',
      middleName: 'none',
      lastName: 'none',
      gender: 'none',
      address: '',
      pinCode: '',
      email: '',
      password: '',
      confirmPassword: '',
      corpoName: '',
      branch: '',
      landlineNumber: '',
      userType: 3,
      createdBy: this.userSessionDetails?.username,
      folderName: '',
      retentionNeeded: '',
      cloudProvider: '',
      oneDriveUserId: '',
      onedriveUsername: '',
      onedrivePassword: '',
      onedriveTenantId: '',
      onedriveClientId: '',
      clientSecret: '',
      awsAccessKey: '',
      awsSecretKey: '',
      awsRegion: ''
    });
  }

  closeModal(): void {
    this.modalDisplayStyle = 'none';
    if (!this.userMessage) {
      this.redirectToCorpList();
    }
  }

  redirectToCorpList(): void {
    this.router.navigate(['corporateaccount']);
  }
}