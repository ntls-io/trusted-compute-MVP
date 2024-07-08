import Vue from "vue";

export default {
  namespaced: true,

  state() {
    return {};
  },

  actions: {
    fetch(data) {
      return Vue.auth.fetch(data);
    },

    refresh(data) {
      return Vue.auth.refresh(data);
    },

    async login(ctx, data) {
      data = data || {};

      return await Vue.auth.login({
        url: "auth/login",
        data: data.body,
        staySignedIn: data.staySignedIn,
        redirect: { name: "Dashboard" }
      });
    },

    register(ctx, data) {
      data = data || {};

      return new Promise((resolve, reject) => {
        Vue.auth
          .register({
            url: "auth/register",
            data: data.body,
            autoLogin: false
          })
          .then(res => {
            if (data.autoLogin) {
              ctx.dispatch("login", data).then(resolve, reject);
            }
          }, reject);
      });
    },

    logout(ctx) {
      return Vue.auth.logout();
    }
  },

  getters: {
    user() {
      return Vue.auth.user();
    }
  }
};
