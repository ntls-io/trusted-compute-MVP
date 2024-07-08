import Vue from "vue";
import VueRouter from "vue-router";

Vue.use(VueRouter);

const routes = [
  {
    path: "/",
    redirect: "/login"
  },
  {
    path: "/login",
    name: "login",
    meta: { layout: "no-nav" },
    component: () => import("@/views/Login.vue")
  },
  {
    path: "/register",
    name: "register",
    meta: { layout: "no-nav" },
    component: () => import("@/views/Register.vue")
  },
  {
    path: "/home",
    name: "home",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Home.vue")
  },
  {
    path: "/analysis",
    name: "analysis",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Analysis-data.vue")
  },
  {
    path: "/market",
    name: "market",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Market.vue")
  },
  {
    path: "/pools",
    name: "pools",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Pools.vue")
  },
  {
    path: "/tokens",
    name: "tokens",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Tokens.vue")
  },
  {
    path: "/account",
    name: "account",
    meta: { layout: "dashboard" },
    component: () => import("@/views/Account.vue")
  }
];

Vue.router = new VueRouter({
  mode: "history",
  base: process.env.BASE_URL,
  routes
});

export default Vue.router;
