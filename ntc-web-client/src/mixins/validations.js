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

import Ajv from "ajv";
const ajv = new Ajv();

export default {
  methods: {
    async validateSchema(schema) {
      const validate = await ajv.validateSchema(schema);
      return {
        success: validate,
        error: ajv.errorsText(ajv.errors)
      };
    },
    async validateJsonDataAgainstSchema(dataFile, schemaFile) {
      const data = await this.readAsText(dataFile);
      const schema = await this.readAsText(schemaFile);

      const validate = ajv.compile(JSON.parse(schema));

      const result = {
        success: validate(JSON.parse(data)),
        error: ajv.errorsText(validate.errors)
      };

      if (!result.success) {
        this.$bvToast.toast(result.error, {
          title: "Error",
          variant: "danger",
          solid: true
        });
      }

      return result;
    },
    readAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }
  }
};
