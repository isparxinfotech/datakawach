import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CorporateAccountListComponent } from './corporate-account-list.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('CorporateAccountListComponent', () => {
  let component: CorporateAccountListComponent;
  let fixture: ComponentFixture<CorporateAccountListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CorporateAccountListComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(CorporateAccountListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
