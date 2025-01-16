import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicMenusComponent } from './dynamic-menus.component';

describe('DynamicMenusComponent', () => {
  let component: DynamicMenusComponent;
  let fixture: ComponentFixture<DynamicMenusComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DynamicMenusComponent]
    });
    fixture = TestBed.createComponent(DynamicMenusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
