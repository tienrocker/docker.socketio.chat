# Use an official Node.js runtime as the base image
FROM node:23

# # Set the working directory in the container
WORKDIR /app

# # Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

RUN npm install -g nodemon

# Expose port 3000 to the outside
EXPOSE 80

# Define the command to run the application
CMD ["npm", "start"]