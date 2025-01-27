/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
