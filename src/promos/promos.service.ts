import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Promo, PromoDocument, PromoDiscountType } from './schema/promo.schema';
import { CreatePromoDto } from './dto/create-promo.dto';
import { UpdatePromoDto } from './dto/update-promo.dto';

@Injectable()
export class PromosService {
  constructor(
    @InjectModel(Promo.name)
    private promoModel: Model<PromoDocument>,
  ) {}

  async create(dto: CreatePromoDto) {
    const code = dto.code?.trim()?.toUpperCase();
    if (!code) throw new BadRequestException('Promo code is required');

    const created = await this.promoModel.create({
      ...dto,
      code,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    return this.format(created);
  }

  async findAll(query: { activeOnly?: boolean; code?: string } = {}) {
    const filter: Record<string, unknown> = {};
    if (query.activeOnly === true || String(query.activeOnly) === 'true') {
      filter.isActive = true;
    }
    if (query.code) {
      filter.code = String(query.code).trim().toUpperCase();
    }
    const list = await this.promoModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100);
    return list.map((p) => this.format(p));
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid promo id');
    }
    const found = await this.promoModel.findById(id);
    if (!found) throw new NotFoundException('Promo not found');
    return this.format(found);
  }

  async findByCode(code: string, { activeOnly = true } = {}) {
    const normalized = code?.trim()?.toUpperCase();
    if (!normalized) return null;
    const filter: Record<string, unknown> = { code: normalized };
    if (activeOnly) filter.isActive = true;
    return this.promoModel.findOne(filter).exec();
  }

  async update(id: string, dto: UpdatePromoDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid promo id');
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.code) patch.code = dto.code.trim().toUpperCase();
    if (dto.startsAt) patch.startsAt = new Date(dto.startsAt);
    if (dto.expiresAt) patch.expiresAt = new Date(dto.expiresAt);

    const updated = await this.promoModel.findByIdAndUpdate(id, patch, {
      returnDocument: 'after',
    });
    if (!updated) throw new NotFoundException('Promo not found');
    return this.format(updated);
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid promo id');
    }
    const deleted = await this.promoModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Promo not found');
    return { message: 'Promo deleted' };
  }

  async validateCode(code: string, subtotal: number) {
    const promo = await this.findByCode(code, { activeOnly: true });
    const normalized = code?.trim()?.toUpperCase() || '';
    if (!promo) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: 'Invalid promo code',
      };
    }

    const now = new Date();
    if (!promo.isActive) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: 'Promo code is inactive',
      };
    }
    if (promo.startsAt && promo.startsAt > now) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: 'Promo code is not yet valid',
      };
    }
    if (promo.expiresAt && promo.expiresAt < now) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: 'Promo code has expired',
      };
    }
    if (typeof promo.minOrderValue === 'number' && subtotal < promo.minOrderValue) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: `Minimum order value of $${promo.minOrderValue.toFixed(2)} required`,
      };
    }
    if (typeof promo.usageLimit === 'number' && promo.timesUsed >= promo.usageLimit) {
      return {
        valid: false,
        code: normalized,
        discount: 0,
        message: 'Promo code has reached its usage limit',
      };
    }

    let discount = 0;
    if (promo.discountType === PromoDiscountType.FLAT) {
      discount = Math.max(0, Math.min(Number(promo.discountValue) || 0, subtotal));
    } else if (promo.discountType === PromoDiscountType.PERCENT) {
      const pct = (subtotal * (Number(promo.discountValue) || 0)) / 100;
      const capped =
        typeof promo.maxDiscountValue === 'number'
          ? Math.min(pct, promo.maxDiscountValue)
          : pct;
      discount = Math.max(0, Math.min(capped, subtotal));
    }

    discount = Math.round(discount * 100) / 100;

    return {
      valid: true,
      code: normalized,
      discount,
      discountType: promo.discountType as PromoDiscountType,
      promoId: promo._id.toString(),
      message: `Promo applied — $${discount.toFixed(2)} off`,
    };
  }

  async incrementUsage(promoId: Types.ObjectId | string) {
    const id =
      promoId instanceof Types.ObjectId ? promoId : new Types.ObjectId(promoId);
    await this.promoModel
      .updateOne({ _id: id }, { $inc: { timesUsed: 1 } })
      .exec();
  }

  /**
   * Atomic, guarded usage increment: only increments when the promo is still
   * under its usage limit. Returns false if the limit was already reached —
   * prevents over-limit redemptions under concurrent orders.
   */
  async incrementUsageSafe(promoId: Types.ObjectId | string): Promise<boolean> {
    const id =
      promoId instanceof Types.ObjectId ? promoId : new Types.ObjectId(promoId);
    const result = await this.promoModel
      .updateOne(
        {
          _id: id,
          isActive: true,
          $or: [
            { usageLimit: { $exists: false } },
            { usageLimit: null },
            { $expr: { $lt: ['$timesUsed', '$usageLimit'] } },
          ],
        },
        { $inc: { timesUsed: 1 } },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  private format(p: PromoDocument) {
    const obj = p.toObject();
    return {
      id: obj._id.toString(),
      code: obj.code,
      description: obj.description,
      discountType: obj.discountType,
      discountValue: obj.discountValue,
      minOrderValue: obj.minOrderValue,
      maxDiscountValue: obj.maxDiscountValue,
      startsAt: obj.startsAt,
      expiresAt: obj.expiresAt,
      usageLimit: obj.usageLimit,
      timesUsed: obj.timesUsed,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
