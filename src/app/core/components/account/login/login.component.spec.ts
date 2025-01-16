import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from 'src/app/services/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, RouterTestingModule],
      declarations: [LoginComponent],
      providers: [{ provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['loginUser']) }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should invalidate the form when required fields are empty', () => {
    component.frmValidate.controls['username'].setValue('');
    component.frmValidate.controls['password'].setValue('');
    expect(component.frmValidate.valid).toBeFalse();
  });

  it('should validate the form when all required fields are filled', () => {
    component.frmValidate.controls['username'].setValue('testuser');
    component.frmValidate.controls['password'].setValue('testpassword');
    expect(component.frmValidate.valid).toBeTrue();
  });
});
