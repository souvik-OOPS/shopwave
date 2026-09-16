import type { Request, Response } from 'express';

import { brandService } from '@/services/brand.service';
import { categoryService } from '@/services/category.service';
import { productService } from '@/services/product.service';
import type { CreateBrandInput, UpdateBrandInput } from '@/schemas/brand.schema';
import type { CreateCategoryInput, UpdateCategoryInput } from '@/schemas/category.schema';
import type {
  AdminProductQuery,
  CreateProductInput,
  ProductQuery,
  UpdateInventoryInput,
  UpdateProductInput,
} from '@/schemas/product.schema';
import { ApiError, ErrorCode } from '@/utils/ApiError';
import { asyncHandler } from '@/utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendNoContent, sendSuccess } from '@/utils/response';

export const categoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const categories = await categoryService.list(req.query);
    return sendSuccess(res, { categories });
  }),

  getBySlug: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.getBySlug(req.params.slug);
    return sendSuccess(res, { category });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.create(req.body as CreateCategoryInput);
    return sendCreated(res, { category }, 'Category created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.update(req.params.id, req.body as UpdateCategoryInput);
    return sendSuccess(res, { category }, { message: 'Category updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await categoryService.delete(req.params.id);
    return sendNoContent(res);
  }),
};

export const brandController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const brands = await brandService.list(req.query);
    return sendSuccess(res, { brands });
  }),

  getBySlug: asyncHandler(async (req: Request, res: Response) => {
    const brand = await brandService.getBySlug(req.params.slug);
    return sendSuccess(res, { brand });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const brand = await brandService.create(req.body as CreateBrandInput);
    return sendCreated(res, { brand }, 'Brand created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const brand = await brandService.update(req.params.id, req.body as UpdateBrandInput);
    return sendSuccess(res, { brand }, { message: 'Brand updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await brandService.delete(req.params.id);
    return sendNoContent(res);
  }),
};

export const productController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ProductQuery;
    const { items, total, page, limit } = await productService.list(query);
    return sendSuccess(res, { products: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  facets: asyncHandler(async (req: Request, res: Response) => {
    const facets = await productService.facets(req.query as unknown as ProductQuery);
    return sendSuccess(res, facets);
  }),

  getBySlug: asyncHandler(async (req: Request, res: Response) => {
    // Staff may preview drafts; everyone else only ever sees ACTIVE products.
    const canPreview = req.user?.role === 'ADMIN' || req.user?.role === 'STAFF';
    const product = await productService.getBySlug(req.params.slug, canPreview);
    return sendSuccess(res, { product });
  }),

  getRelated: asyncHandler(async (req: Request, res: Response) => {
    const products = await productService.getRelated(req.params.slug);
    return sendSuccess(res, { products });
  }),

  adminList: asyncHandler(async (req: Request, res: Response) => {
    const { items, total, page, limit } = await productService.adminList(
      req.query as unknown as AdminProductQuery,
    );
    return sendSuccess(res, { products: items }, { meta: buildPaginationMeta(total, page, limit) });
  }),

  adminGetById: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getById(req.params.id);
    return sendSuccess(res, { product });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.create(req.body as CreateProductInput);
    return sendCreated(res, { product }, 'Product created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.update(req.params.id, req.body as UpdateProductInput);
    return sendSuccess(res, { product }, { message: 'Product updated' });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await productService.remove(req.params.id);
    return sendNoContent(res);
  }),

  uploadImages: asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw ApiError.badRequest('No image files were provided', ErrorCode.UPLOAD_FAILED);
    }

    const product = await productService.uploadImages(req.params.id, files);
    return sendCreated(res, { product }, `${files.length} image(s) uploaded`);
  }),

  deleteImage: asyncHandler(async (req: Request, res: Response) => {
    await productService.deleteImage(req.params.id, req.params.imageId);
    return sendNoContent(res);
  }),

  updateInventory: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.updateInventory(
      req.params.id,
      req.body as UpdateInventoryInput,
    );
    return sendSuccess(res, { product }, { message: 'Inventory updated' });
  }),
};
