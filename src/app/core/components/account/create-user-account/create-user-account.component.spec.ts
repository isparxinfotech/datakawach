import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateUserAccountComponent } from './create-user-account.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('CreateUserAccountComponent', () => {
  let component: CreateUserAccountComponent;
  let fixture: ComponentFixture<CreateUserAccountComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CreateUserAccountComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(CreateUserAccountComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
