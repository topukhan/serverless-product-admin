import './styles/main.css';

import { loadBranding } from './services/branding.js';
import { defineRoute, startRouter, setNotFoundHandler } from './services/router.js';
import { requireAdmin } from './services/admin-guard.js';

import { Layout } from './components/layout.js';
import { AdminLayout } from './components/admin-layout.js';

import { HomePage } from './pages/home.js';
import { ProductsPage } from './pages/products.js';
import { ProductDetailPage } from './pages/product-detail.js';
import { CartPage } from './pages/cart.js';
import { NotFoundPage } from './pages/not-found.js';

import { AdminLoginPage } from './pages/admin/login.js';
import { AdminDashboard } from './pages/admin/dashboard.js';
import { AdminProductsList } from './pages/admin/products-list.js';
import { AdminProductEdit } from './pages/admin/product-edit.js';
import { AdminCategoriesPage } from './pages/admin/categories.js';
import { AdminReviewsPage } from './pages/admin/reviews.js';
import { AdminQuestionsPage } from './pages/admin/questions.js';
import { AdminSiteSettings } from './pages/admin/site-settings.js';
import { AdminBrandingPage } from './pages/admin/branding.js';
import { AdminComingSoon } from './pages/admin/coming-soon.js';

async function boot() {
  await loadBranding();

  /* Public routes */
  defineRoute('/',             async ()       => Layout(await HomePage()));
  defineRoute('/products',     async ()       => Layout(await ProductsPage()));
  defineRoute('/product/:id',  async (params) => Layout(await ProductDetailPage(params)));
  defineRoute('/cart',         async ()       => Layout(await CartPage()));

  /* Admin routes */
  defineRoute('/admin/login',       async () => AdminLoginPage());

  defineRoute('/admin', async () =>
    requireAdmin(async () => AdminLayout(await AdminDashboard(), { active: 'dashboard' }))
  );

  // Order matters: define '/new' before ':id' so the literal wins.
  defineRoute('/admin/products',     async () =>
    requireAdmin(async () => AdminLayout(await AdminProductsList(), { active: 'products' }))
  );
  defineRoute('/admin/products/new', async () =>
    requireAdmin(async () => AdminLayout(await AdminProductEdit(), { active: 'products' }))
  );
  defineRoute('/admin/products/:id', async (params) =>
    requireAdmin(async () => AdminLayout(await AdminProductEdit(params), { active: 'products' }))
  );

  defineRoute('/admin/site-settings', async () =>
    requireAdmin(async () => AdminLayout(await AdminSiteSettings(), { active: 'site-settings' }))
  );

  defineRoute('/admin/categories', async () =>
    requireAdmin(async () => AdminLayout(await AdminCategoriesPage(), { active: 'categories' }))
  );
  defineRoute('/admin/reviews', async () =>
    requireAdmin(async () => AdminLayout(await AdminReviewsPage(), { active: 'reviews' }))
  );
  defineRoute('/admin/questions', async () =>
    requireAdmin(async () => AdminLayout(await AdminQuestionsPage(), { active: 'questions' }))
  );
  defineRoute('/admin/branding', async () =>
    requireAdmin(async () => AdminLayout(await AdminBrandingPage(), { active: 'branding' }))
  );

  // Friendly 404 wrapped in the public Layout so it gets the header + footer.
  // Admin paths starting with /admin/ also flow through here if no admin route
  // matched — that's fine, the public layout still renders.
  setNotFoundHandler(async (path) => Layout(NotFoundPage(path)));

  startRouter(document.getElementById('app'));
}

boot();
