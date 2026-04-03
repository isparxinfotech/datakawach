import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabDetailsComponent } from './lab-details.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('LabDetailsComponent', () => {
  let component: LabDetailsComponent;
  let fixture: ComponentFixture<LabDetailsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [LabDetailsComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(LabDetailsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
