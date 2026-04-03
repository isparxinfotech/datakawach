import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserAccountListComponent } from './user-account-list.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('CorporateAccountListComponent', () => {
  let component: UserAccountListComponent;
  let fixture: ComponentFixture<UserAccountListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UserAccountListComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(UserAccountListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
