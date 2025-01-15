// app/page.tsx
"use client"

export default function Home() {
  const statsItems = [
    {
      label: "Data Pool",
      value: "1"
    },
    {
      label: "Digital Rights Tokens Sold",
      value: "3"
    },
    {
      label: "Digital Rights Tokens Purchased",
      value: "1"
    },
    {
      label: "Amount Paid Out",
      value: "$20"
    }
  ]

  const fields = ["Name", "Description", "Digital Rights", ""]

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-1">
          <div className="bg-white rounded-lg shadow">
            <ul className="divide-y">
              {statsItems.map((item, index) => (
                <li 
                  key={index}
                  className="flex justify-between items-center p-4"
                >
                  <span className="text-gray-700">{item.label}</span>
                  <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <table className="min-w-full">
          <thead className="bg-gray-800">
            <tr>
              {fields.map((field, index) => (
                <th 
                  key={index} 
                  className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                No data available
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}