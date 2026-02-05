import type { Request, Response } from 'express';
import { createProduct, deleteProduct, listProducts, updateProduct } from './service';

export const getProducts = async (req: Request, res: Response) => {
  const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const pageParam = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
  const { products, total } = await listProducts(limitParam, pageParam);
  res.setHeader('X-Total-Count', String(total));
  return res.json(products);
};

export const postProduct = async (req: Request, res: Response) => {
  const result = await createProduct(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.product);
};

export const putProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await updateProduct(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result.product);
};

export const removeProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteProduct(id);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
