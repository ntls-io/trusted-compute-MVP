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
import Upload from "@websanova/vue-upload/dist/v2/vue-upload.esm.js";
import driverHttpAxios from "@websanova/vue-upload/dist/drivers/http/axios.esm.js";

Vue.use(Upload, {
  plugins: {
    http: Vue.axios
  },
  drivers: {
    http: driverHttpAxios
  },
  options: {}
});
