var express = require("express");
var app = express();
var httpObj = require("http");
var http = httpObj.createServer(app);
const fs = require("fs");

var mainURL = "http://localhost:3000";

const MongoClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectId;
const uri =
  "mongodb+srv://inShare:TABLE1234@cluster0.u8thi.mongodb.net/inshare?retryWrites=true&w=majority";

app.set("view engine", "ejs");

app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/public/js", express.static(__dirname + "/public/js"));
app.use(
  "/public/font-awesome-4.7.0",
  express.static(__dirname + "/public/font-awesome-4.7.0")
);

var session = require("express-session");
app.use(
  session({
    secret: "secret key",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(function (request, result, next) {
  request.mainURL = mainURL;
  request.isLogin = typeof request.session.user !== "undefined";
  request.user = request.session.user;

  next();
});

var formidable = require("express-formidable");
app.use(formidable());

var bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");

var nodemailerFrom = "2322rohini@gmail.com";
var nodemailerObject = {
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "dandekar.anushree3@gmail.com",
    pass: "tubelight",
  },
};

var fileSystem = require("fs");

var rimraf = require("rimraf");

// recursive function to get the folder from uploaded
function recursiveGetFolder(files, _id) {
  var singleFile = null;
  for (var a = 0; a < files.length; a++) {
    const file = files[a];

    // return if the file type is folder and ID is found
    if (file.type == "folder") {
      if (file._id == _id) {
        return file;
      }

      // if it has files, then do the recursion
      if (file.files.length > 0) {
        singleFile = recursiveGetFolder(file.files, _id);
        //return the file if found in sub-folders
        if (singleFile != null) {
          return singleFile;
        }
      }
    }
  }
}

//function to add new uploaded object and return the updated array
function getUpdatedArray(arr, _id, uploadedObj) {
  const { ObjectId } = require("mongodb");
  for (var a = 0; a < arr.length; a++) {
    // push in files array if type is folder and ID is found
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        arr[a].files.push(uploadedObj);
        arr[a]._id = ObjectId(arr[a]._id);
      }

      // if it has files, then do the recursion
      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        getUpdatedArray(arr[a].files, _id, uploadedObj);
      }
    }
  }

  return arr;
}

//recursive function to remove the file and return the updates updatedArray
function removeFileReturnUpdated(arr, _id) {
  for (var a = 0; a < arr.length; a++) {
    if (arr[a].type != "folder" && arr[a]._id == _id) {
      //remove the uploads folder
      try {
        fileSystem.unlinkSync(arr[a].filePath);
      } catch (exp) {
        //
      }
      // remove the file from array
      arr.splice(a, 1);
      break;
    }
    // do the recursion if it has sub-folders
    if (arr[a].type == "folder" && arr[a].files.length > 0) {
      arr[a]._id = ObjectId(arr[a]._id);
      removeFileReturnUpdated(arr[a].files, _id);
    }
  }
  return arr;
}

//recursive function to remove the folder and return the updates updatedArray
function removeFolderReturnUpdated(arr, _id) {
  for (var a = 0; a < arr.length; a++) {
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        //remove the folder with all sub-directories in it
        rimraf(arr[a].folderPath, function () {
          console.log("done");
        });
        arr.splice(a, 1);
        break;
      }
      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        removeFolderReturnUpdated(arr[a].files, _id);
      }
    }
  }
  return arr;
}

http.listen(3000, function () {
  console.log("Server started at " + mainURL);

  const mongo = new MongoClient(uri, { useUnifiedTopology: true });
  mongo.connect((err) => {
    console.log("Connected to MongoDB server...");

    // Route to delete directory
    app.post("/DeleteDirectory", async function (request, result) {
      const _id = request.fields._id;

      if (request.session.user) {
        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            _id: ObjectId(request.session.user._id),
          });

        var updatedArray = await removeFolderReturnUpdated(user.uploaded, _id);
        for (var a = 0; a < updatedArray.length; a++) {
          updatedArray[a]._id = ObjectId(updatedArray[a]._id);
        }

        await mongo
          .db("inshare")
          .collection("users")
          .updateOne(
            {
              _id: ObjectId(request.session.user._id),
            },
            {
              $set: {
                uploaded: updatedArray,
              },
            }
          );
        console.log("Almost end");
        const backURL = request.header("Referer") || "/";
        result.redirect(backURL);
        return false;
      }
      console.log("about to call login");
      result.redirect("/Login");
    });

    // Route to delete file
    app.post("/DeleteFile", async function (request, result) {
      const _id = request.fields._id;

      if (request.session.user) {
        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            _id: ObjectId(request.session.user._id),
          });

        var updatedArray = await removeFileReturnUpdated(user.uploaded, _id);
        for (var a = 0; a < updatedArray.length; a++) {
          updatedArray[a]._id = ObjectId(updatedArray[a]._id);
        }

        await mongo
          .db("inshare")
          .collection("users")
          .updateOne(
            {
              _id: ObjectId(request.session.user._id),
            },
            {
              $set: {
                uploaded: updatedArray,
              },
            }
          );

        const backURL = request.header("Referer") || "/";
        result.redirect(backURL);
        return false;
      }
      result.redirect("/Login");
    });

    // Route to upload file
    app.post("/UploadFile", async function (request, result) {
      if (request.session.user) {
        const { ObjectId } = require("mongodb");
        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            _id: ObjectId(request.session.user._id),
          });

        if (request.files.file.size > 0) {
          const _id = request.fields._id;

          var uploadedObj = {
            _id: ObjectId(),
            size: request.files.file.size,
            name: request.files.file.name,
            type: request.files.file.type,
            filePath: "",
            createdAt: new Date().getTime(),
          };

          var filePath = "";

          //if it is the root path
          if (_id == "") {
            filePath =
              "public/uploads/" +
              user.email +
              "/" +
              new Date().getTime() +
              "-" +
              request.files.file.name;
            uploadedObj.filePath = filePath;

            if (!fileSystem.existsSync("public/uploads/" + user.email)) {
              fileSystem.mkdirSync("public/uploads/" + user.email);
            }

            fileSystem.readFile(request.files.file.path, function (err, data) {
              if (err) throw err;
              console.log("File read!");

              //write the file
              fileSystem.writeFile(filePath, data, async function (err) {
                if (err) throw err;
                console.log("File written!");

                await mongo
                  .db("inshare")
                  .collection("users")
                  .updateOne(
                    {
                      _id: ObjectId(request.session.user._id),
                    },
                    {
                      $push: {
                        uploaded: uploadedObj,
                      },
                    }
                  );
                result.redirect("/MyUploads/" + _id);
              });

              //Delete the file
              fileSystem.unlink(request.files.file.path, function (err) {
                if (err) throw err;
                console.log("File deleted!");
              });
            });
          } else {
            // if it is a folder

            var folderObj = await recursiveGetFolder(user.uploaded, _id);

            uploadedObj.filePath =
              folderObj.folderPath + "/" + request.files.file.name;

            var updatedArray = await getUpdatedArray(
              user.uploaded,
              _id,
              uploadedObj
            );

            //read the file
            fileSystem.readFile(request.files.file.path, function (err, data) {
              if (err) throw err;
              console.log("File read!");

              //write the file
              fileSystem.writeFile(
                uploadedObj.filePath,
                data,
                async function (err, data) {
                  if (err) throw err;
                  console.log("File written!");

                  for (var a = 0; a < updatedArray.length; a++) {
                    updatedArray[a]._id = ObjectId(updatedArray[a]._id);
                  }

                  await mongo
                    .db("inshare")
                    .collection("users")
                    .updateOne(
                      {
                        _id: ObjectId(request.session.user._id),
                      },
                      {
                        $set: {
                          uploaded: updatedArray,
                        },
                      }
                    );

                  result.redirect("/MyUploads/" + _id);
                }
              );

              //delete the file
              fileSystem.unlink(request.files.file.path, function (err) {
                if (err) throw err;
                console.log("File deleted!");
              });
            });
          }
        } else {
          request.status = "error";
          request.message = "Please select valid image.";

          result.render("MyUploads", {
            request: request,
          });
        }

        return false;
      }
      result.redirect("/Login");
    });

    // Route to create folder
    app.post("/CreateFolder", async function (request, result) {
      const name = request.fields.name;
      const _id = request.fields._id;

      if (request.session.user) {
        const { ObjectId } = require("mongodb");
        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            _id: ObjectId(request.session.user._id),
          });

        var uploadedObj = {
          _id: ObjectId(),
          type: "folder",
          folderName: name,
          files: [],
          folderPath: "",
          createdAt: new Date().getTime(),
        };

        var folderPath = "";
        var updatedArray = [];
        if (_id == "") {
          // uploaded = user.uploaded;
          folderPath = "public/uploads/" + user.email + "/" + name;
          uploadedObj.folderPath = folderPath;

          if (!fileSystem.existsSync("public/uploads/" + user.email)) {
            fileSystem.mkdirSync("public/uploads/" + user.email);
          }
        } else {
          var folderObj = await recursiveGetFolder(user.uploaded, _id);
          uploadedObj.folderPath = folderObj.folderPath + "/" + name;
          updatedArray = await getUpdatedArray(user.uploaded, _id, uploadedObj);
        }

        if (uploadedObj.folderPath == "") {
          request.session.status = "error";
          request.session.message = "Folder name must not be empty.";
          result.redirect("/MyUploads");
          return false;
        }

        if (fileSystem.existsSync(uploadedObj.folderPath)) {
          request.session.status = "error";
          request.session.message = "Folder with same name already exists";
          result.redirect("/MyUploads");
          return false;
        }

        fileSystem.mkdirSync(uploadedObj.folderPath);

        if (_id == "") {
          await mongo
            .db("inshare")
            .collection("users")
            .updateOne(
              {
                _id: ObjectId(request.session.user._id),
              },
              {
                $push: {
                  uploaded: uploadedObj,
                },
              }
            );
        } else {
          for (var a = 0; a < updatedArray.length; a++) {
            updatedArray[a]._id = ObjectId(updatedArray[a]._id);
          }

          await mongo
            .db("inshare")
            .collection("users")
            .updateOne(
              {
                _id: ObjectId(request.session.user._id),
              },
              {
                $set: {
                  uploaded: updatedArray,
                },
              }
            );
        }

        result.redirect("/MyUploads/" + _id);
        return false;
      }

      result.redirect("/Login");
    });

    // What??
    app.get("/MyUploads/:_id?", async function (request, result) {
      const _id = request.params._id;
      if (request.session.user) {
        const { ObjectId } = require("mongodb");

        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            _id: ObjectId(request.session.user._id),
          });

        var uploaded = null;
        var folderName = "";
        var createdAt = "";
        if (typeof _id == "undefined") {
          uploaded = user.uploaded;
        } else {
          var folderObj = await recursiveGetFolder(user.uploaded, _id);

          if (folderObj == null) {
            request.status = "error";
            request.message = "Folder not found.";
            result.render("MyUploads", {
              request: request,
            });

            return false;
          }

          uploaded = folderObj.files;
          folderName = folderObj.folderName;
          createdAt = folderObj.createdAt;
        }

        if (uploaded == null) {
          request.status = "error";
          request.message = "Directory not found.";
          result.render("MyUploads", {
            request: request,
          });
          return false;
        }

        result.render("MyUploads", {
          request: request,
          uploaded: uploaded,
          _id: _id,
          folderName: folderName,
          createdAt: createdAt,
        });
        return false;
      }
      result.redirect("/Login");
    });

    // What??
    app.get("/", function (request, result) {
      result.render("index", {
        request: request,
      });
    });

    // To get the register page
    app.get("/Register", function (request, result) {
      result.render("Register", {
        request: request,
      });
    });

    // To register
    app.post("/Register", async function (request, result) {
      var name = request.fields.name;
      var email = request.fields.email;
      var password = request.fields.password;
      var reset_token = "";
      var isVerified = false;
      var verification_token = new Date().getTime();

      var user = await mongo
        .db("inshare")
        .collection("users")
        .findOne({ email: email });
      console.log(user);

      if (user == null) {
        bcrypt.hash(password, 10, async function (error, hash) {
          await mongo
            .db("inshare")
            .collection("users")
            .insertOne(
              {
                name: name,
                email: email,
                password: hash,
                reset_token: reset_token,
                uploaded: [],
                sharedWithMe: [],
                isVerified: isVerified,
                verification_token: verification_token,
              },
              async function (data) {
                var transporter = nodemailer.createTransport(nodemailerObject);

                var text =
                  "Please verify your account by clicking on the following link: " +
                  mainURL +
                  "/verifyEmail/" +
                  email +
                  "/" +
                  verification_token;

                var html =
                  "Please verify your account by clicking on the following link: <br><br> <a href='" +
                  mainURL +
                  "/verifyEmail/" +
                  email +
                  "/" +
                  verification_token +
                  "'>Confirm Email</a> <br><br> Thank you.";

                await transporter.sendMail(
                  {
                    from: nodemailerFrom,
                    to: email,
                    subject: "Email Verification",
                    text: text,
                    html: html,
                  },
                  function (error, info) {
                    if (error) {
                      console.error(error);
                    } else {
                      console.log("Email sent: " + info.response);
                    }

                    request.status = "success";
                    request.message =
                      "Signed up successfully. An email has been sent to verify your account.";

                    result.render("Register", {
                      request: request,
                    });
                  }
                );
              }
            );
        });
      } else {
        request.status = "error";
        request.message = "Email already exists.";

        result.render("Register", {
          request: request,
        });
      }
    });

    // To verify email
    app.get(
      "/verifyEmail/:email/:verification_token",
      async function (request, result) {
        var email = request.params.email;
        var verification_token = request.params.verification_token;

        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            $and: [
              {
                email: email,
              },
              {
                verification_token: parseInt(verification_token),
              },
            ],
          });

        if (user == null) {
          request.status = "error";
          request.message =
            "Email does not exist. Or verification link is expired.";

          result.render("Login", {
            request: request,
          });
        } else {
          await mongo
            .db("inshare")
            .collection("users")
            .findOneAndUpdate(
              {
                $and: [
                  {
                    email: email,
                  },
                  {
                    verification_token: parseInt(verification_token),
                  },
                ],
              },
              {
                $set: {
                  verification_token: "",
                  isVerified: true,
                },
              }
            );

          request.status = "success";
          request.message = "Account has been verified. Please try to login.";
          result.render("Login", {
            request: request,
          });
        }
      }
    );

    // To get Login page
    app.get("/Login", function (request, result) {
      result.render("Login", {
        request: request,
      });
    });

    // To login
    app.post("/Login", async function (request, result) {
      var email = request.fields.email;
      var password = request.fields.password;

      var user = await mongo.db("inshare").collection("users").findOne({
        email: email,
      });

      if (user == null) {
        request.status = "error";
        request.message = "Email does not exist.";
        result.render("Login", {
          request: request,
        });

        return false;
      }
      bcrypt.compare(password, user.password, function (error, isVerify) {
        if (isVerify) {
          if (user.isVerified) {
            request.session.user = user;
            result.redirect("/");

            return false;
          }

          request.status = "error";
          request.message = "Kindly verify your email.";
          result.render("Login", {
            request: request,
          });

          return false;
        }

        request.status = "error";
        request.message = "Password is not correct.";
        result.render("Login", {
          request: request,
        });
      });
    });

    // To get forgot password page
    app.get("/ForgotPassword", function (request, result) {
      result.render("ForgotPassword", {
        request: request,
      });
    });

    // to get recovery link
    app.post("/SendRecoveryLink", async function (request, result) {
      var email = request.fields.email;
      var user = await mongo.db("inshare").collection("users").findOne({
        email: email,
      });

      if (user == null) {
        request.status = "error";
        request.message = "Email does not exist.";
        result.render("ForgotPassword", {
          request: request,
        });

        return false;
      }

      var reset_token = new Date().getTime();

      await mongo
        .db("inshare")
        .collection("users")
        .findOneAndUpdate(
          {
            email: email,
          },
          {
            $set: {
              reset_token: reset_token,
            },
          }
        );

      var transporter = nodemailer.createTransport(nodemailerObject);

      var text =
        "Please click the following link to reset your password: " +
        mainURL +
        "/ResetPassword/" +
        email +
        "/" +
        reset_token;

      var html =
        "Please click the following link to reset your password: <br><br> <a href='" +
        mainURL +
        "/ResetPassword/" +
        email +
        "/" +
        reset_token +
        "'>Reset Password</a> <br><br> Thank you.";

      transporter.sendMail(
        {
          from: nodemailerFrom,
          to: email,
          subject: "Reset Password",
          text: text,
          html: html,
        },
        function (error, info) {
          if (error) {
            console.error(error);
          } else {
            console.log("Email sent: " + info.response);
          }

          request.status = "success";
          request.message =
            "Email has been sent with the link to recover your password.";

          result.render("ForgotPassword", {
            request: request,
          });
        }
      );
    });

    // To get reset password page
    app.get(
      "/ResetPassword/:email/:reset_token",
      async function (request, result) {
        var email = request.params.email;
        var reset_token = request.params.reset_token;

        var user = await mongo
          .db("inshare")
          .collection("users")
          .findOne({
            $and: [
              {
                email: email,
              },
              {
                reset_token: parseInt(reset_token),
              },
            ],
          });

        if (user == null) {
          request.status = "error";
          request.message = "Link is expires";
          result.render("Error", {
            request: request,
          });

          return false;
        }

        result.render("ResetPassword", {
          request: request,
          email: email,
          reset_token: reset_token,
        });
      }
    );

    // To reset the password
    app.post("/ResetPassword", async function (request, result) {
      var email = request.fields.email;
      var reset_token = request.fields.reset_token;
      var new_password = request.fields.new_password;
      var confirm_password = request.fields.confirm_password;

      if (new_password != confirm_password) {
        request.status = "error";
        request.message = "Password does not match";
        result.render("ResetPassword", {
          request: request,
          email: email,
          reset_token: reset_token,
        });

        return false;
      }

      var user = await mongo
        .db("inshare")
        .collection("users")
        .findOne({
          $and: [
            {
              email: email,
            },
            {
              reset_token: parseInt(reset_token),
            },
          ],
        });

      if (user == null) {
        request.status = "error";
        request.message = "Email does not exist or recovery link is expired.";
        result.render("ResetPassword", {
          request: request,
          email: email,
          reset_token: reset_token,
        });

        return false;
      }
      bcrypt.hash(new_password, 10, async function (error, hash) {
        await mongo
          .db("inshare")
          .collection("users")
          .findOneAndUpdate(
            {
              $and: [
                {
                  email: email,
                },
                {
                  reset_token: parseInt(reset_token),
                },
              ],
            },
            {
              $set: {
                reset_token: "",
                password: hash,
              },
            }
          );

        request.status = "success";
        request.message = "Password has been changed.";

        result.render("Login", {
          request: request,
        });
      });
    });
  });
});
