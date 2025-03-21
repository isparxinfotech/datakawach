import { Component, OnInit, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-personal-information',
  templateUrl: './create-corporate-account.component.html',
  styleUrls: ['./create-corporate-account.component.css']
})
export class CreateCorporateAccountComponent implements OnInit, OnDestroy {
  submitted = false;
  registerUserRequest!: RegisterUserRequest;
  userSessionDetails: userSessionDetails | null | undefined;
  frmValidate: FormGroup;
  registerUserRequestubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";
  selectedCloudProvider: string = '';

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.frmValidate = this.fv.group({
      firstName: ['none', [Validators.minLength(3), Validators.maxLength(50), Validators.pattern('^[a-zA-Z]+$')]],
      middleName: ['none', [Validators.minLength(3), Validators.maxLength(50), Validators.pattern('^[a-zA-Z]+$')]],
      lastName: ['none', [Validators.minLength(3), Validators.maxLength(50), Validators.pattern('^[a-zA-Z]+$')]],
      gender: ['none', [Validators.maxLength(20)]],
      dateOfBirth: ['2000-01-01'],
      address: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
      city: ['none'],
      pinCode: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(20), Validators.pattern('[0-9]*')]],
      mobileNumber: ['0000000000', [Validators.minLength(10), Validators.maxLength(15), Validators.pattern('[0-9]*')]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(50)]],
      corpoName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      branch: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      landlineNumber: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(15), Validators.pattern('[0-9]*')]],
      userType: [3], // Corporate user type
      password: ['qwerty', [Validators.minLength(3), Validators.maxLength(150)]],
      createdBy: [''], // Will be set dynamically
      folderName: [''], // Will be set to email dynamically
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
    });
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.frmValidate.patchValue({
      createdBy: this.userSessionDetails?.username
    });
  }

  ngOnDestroy(): void {
    this.registerUserRequestubscription?.unsubscribe();
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onCloudProviderChange(event: Event) {
    this.selectedCloudProvider = (event.target as HTMLSelectElement).value;
    this.updateFormValidators();
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
    }

    // Update validation status for all conditional fields
    this.frmValidate.get('oneDriveUserId')?.updateValueAndValidity();
    this.frmValidate.get('onedriveUsername')?.updateValueAndValidity();
    this.frmValidate.get('onedrivePassword')?.updateValueAndValidity();
    this.frmValidate.get('onedriveTenantId')?.updateValueAndValidity();
    this.frmValidate.get('onedriveClientId')?.updateValueAndValidity();
    this.frmValidate.get('clientSecret')?.updateValueAndValidity();
    this.frmValidate.get('awsAccessKey')?.updateValueAndValidity();
    this.frmValidate.get('awsSecretKey')?.updateValueAndValidity();
    this.frmValidate.get('awsRegion')?.updateValueAndValidity();
  }

  onCreateCoprporateAccount() {
    this.submitted = true;

    if (this.frmValidate.invalid) {
      console.log('Form is invalid', this.frmValidate.errors);
      return;
    }

    this.registerUserRequest = this.frmValidate.value as RegisterUserRequest;
    this.registerUserRequest.userType = 3; // Corporate user type
    this.registerUserRequest.folderName = this.registerUserRequest.email;

    console.log('Form submitted:', this.registerUserRequest);
    this.registerUserRequestubscription = this.authService.registerUser(this.registerUserRequest)
      .subscribe(
        (response) => {
          console.log('Success:', response);
          this.userMessage = "";
          this.modalDisplayStyle = "block";
          this.onReset();
        },
        (error) => {
          console.error('Error:', error);
          this.modalDisplayStyle = "block";
          this.userMessage = error.error?.message || "User already exists or cloud setup failed.";
        }
      );
  }

  onReset(): void {
    this.submitted = false;
    this.selectedCloudProvider = '';
    this.frmValidate.reset();
    this.frmValidate.patchValue({
      firstName: 'none',
      middleName: 'none',
      lastName: 'none',
      gender: 'none',
      dateOfBirth: '2000-01-01',
      city: 'none',
      mobileNumber: '0000000000',
      userType: 3,
      password: 'qwerty',
      createdBy: this.userSessionDetails?.username
    });
  }

  closeModel(): void {
    this.modalDisplayStyle = "none";
    this.redirectToCorpList();
  }

  redirectToCorpList(): void {
    this.router.navigate(['corporateaccount']);
  }
}