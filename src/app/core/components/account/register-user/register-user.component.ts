import { Component, OnDestroy } from '@angular/core';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { AuthService } from '../../../../services/auth.service';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register-user',
  templateUrl: './register-user.component.html',
  styleUrls: ['./register-user.component.css']
})
export class RegisterUserComponent implements OnDestroy {
  submitted = false;
  model: RegisterUserRequest;
  frmValidate: FormGroup;
  private registerUserSubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.model = {
      firstName: '',
      middleName: '',
      lastName: '',
      gender: '',
      dateOfBirth: null,
      address: '',
      city: '',
      pinCode: '',
      mobileNumber: '',
      email: '',
      password: '',
      corpoName: '',
      branch: '',
      landlineNumber: '',
      userType: 0,
      oneDriveUserId: '',
      onedriveUsername: '',
      onedrivePassword: '',
      onedriveTenantId: '',
      onedriveClientId: '',
      clientSecret: '',
      folderName: '',
      cloudProvider: '',
      ipAddress: '',
      retentionNeeded: 1
    };
    this.frmValidate = fv.group(
      {
        firstName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
        middleName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
        lastName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
        gender: ['', [Validators.required]],
        dateOfBirth: ['', [Validators.required]],
        address: ['', [Validators.required, Validators.minLength(3)]],
        city: ['', [Validators.required]],
        pinCode: ['', [Validators.required, Validators.minLength(6), Validators.pattern('[0-9]*')]],
        mobileNumber: ['', [Validators.required, Validators.minLength(10), Validators.pattern('[0-9]*')]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(4)]],
        confirmPwd: ['', [Validators.required, Validators.minLength(4)]],
        isTermsAndCondtionAccepted: ['', [Validators.required]],
        oneDriveUserId: ['', [Validators.maxLength(250)]],
        onedriveUsername: ['', [Validators.maxLength(250)]],
        onedrivePassword: ['', [Validators.maxLength(250)]],
        onedriveTenantId: ['', [Validators.maxLength(250)]],
        onedriveClientId: ['', [Validators.maxLength(250)]],
        clientSecret: ['', [Validators.maxLength(250)]]
      },
      {
        validators: [this.passwordMatchValidator]
      }
    );
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPwd = form.get('confirmPwd')?.value;
    return password === confirmPwd ? null : { mismatch: true };
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onRegisterUser() {
    this.submitted = true;
    if (this.frmValidate.invalid) {
      console.log('Form is invalid', this.frmValidate.errors, this.frmValidate.value);
      this.userMessage = 'Please correct the errors in the form.';
      this.modalDisplayStyle = 'block';
      return;
    }

    this.model = Object.assign(this.model, this.frmValidate.value);
    console.log('Form submitted:', this.model);
    this.model.userType = 5; // used for normal/end user
    this.model.corpoName = 'none';
    this.model.landlineNumber = 'none';
    this.model.branch = 'none';
    this.registerUserSubscription = this.authService.registerUser(this.model)
      .subscribe({
        next: (response) => {
          console.log(response);
          this.userMessage = '';
          this.modalDisplayStyle = 'block';
        },
        error: (error) => {
          console.error('Error:', error);
          this.modalDisplayStyle = 'block';
          this.userMessage = error.error?.message || 'User already exists, please login';
        }
      });
  }

  onReset(): void {
    this.submitted = false;
    this.userMessage = '';
    this.modalDisplayStyle = 'none';
    this.frmValidate.reset();
  }

  ngOnDestroy(): void {
    this.registerUserSubscription?.unsubscribe();
  }

  closeModel(): void {
    this.modalDisplayStyle = 'none';
    if (!this.userMessage) {
      this.router.navigate(['/login']);
    }
  }

  OpenModel(): void {
    this.modalDisplayStyle = 'block';
  }
}