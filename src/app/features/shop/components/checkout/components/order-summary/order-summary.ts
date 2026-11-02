import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { CartItem } from '@core/models/cart.model';

@Component({
  selector: 'app-order-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
})
export class OrderSummary {
  @Input() items: CartItem[] = [];
  @Input() subtotal?: number;
  @Input() discountPercentage: number = 0;
  @Input() discountAmount: number = 0;
  @Input() total: number = 0;
}
