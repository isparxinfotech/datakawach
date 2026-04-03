import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterUserComponent } from './register-user.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('RegisterUserComponent', () => {
  let component: RegisterUserComponent;
  let fixture: ComponentFixture<RegisterUserComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RegisterUserComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(RegisterUserComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
